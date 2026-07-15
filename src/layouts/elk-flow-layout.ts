import ELK, {
	type ElkExtendedEdge,
	type ElkNode,
	type ElkPoint,
} from 'elkjs/lib/elk.bundled.js';
import type {
	ChartGroupDefinition,
	FlowDirection,
	FlowEdgeStyle,
	FlowRelationRule,
} from '../core/types';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import { createFlowLayoutPlan } from './flow-relation-layout';
import {
	scaleLayoutGroupPadding,
	type FlowGroupGeometry,
} from './group-geometry';
import type { LayoutEngine } from './layout-engine';

export type OrthogonalRouteMap = Map<string, ElkPoint[]>;

const FLOW_NODE_WIDTH = 120;
const FLOW_NODE_HEIGHT = 44;
const FLOW_GROUP_BASE_PADDING = 12;
const FLOW_GROUP_EXTRA_PADDING = 48;

interface ElkNodeBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface FlowElkHierarchy {
	children: ElkNode[];
	groupElkIdByGroupId: Map<string, string>;
}

export class ElkFlowLayout implements LayoutEngine {
	private readonly elk = new ELK();
	private orthogonalRoutes: OrthogonalRouteMap = new Map();
	private conflictCount = 0;
	private groupGeometries: FlowGroupGeometry[] = [];

	constructor(
		private readonly edgeStyle: FlowEdgeStyle = 'orthogonal',
		private readonly direction: FlowDirection = 'LR',
		private readonly layerSpacing = 1,
		private readonly laneSpacing = 1,
		private readonly relationRules: FlowRelationRule[] = [],
		private readonly groups: readonly ChartGroupDefinition[] = [],
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const plan = createFlowLayoutPlan(graph, this.relationRules);
		this.conflictCount = plan.conflictCount;
		const flowLayoutOptions = createFlowElkLayoutOptions(
			this.edgeStyle,
			this.direction,
			this.layerSpacing,
			this.laneSpacing,
		);
		const hierarchy = createFlowElkHierarchy(
			graph,
			plan.nodeLayoutOptions,
			this.groups,
			this.groupByNode,
			flowLayoutOptions,
		);
		const elkGraph: ElkNode = {
			id: 'root',
			layoutOptions: {
				...flowLayoutOptions,
				'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
			},
			children: hierarchy.children,
			edges: plan.edges,
		};

		const result = await this.elk.layout(elkGraph);
		const boundsById = collectElkNodeBounds(result);
		for (const nodeId of graph.nodes()) {
			const bounds = boundsById.get(nodeId);
			if (!bounds) {
				continue;
			}
			graph.mergeNodeAttributes(nodeId, {
				x: bounds.x + bounds.width / 2,
				y: bounds.y + bounds.height / 2,
			});
		}
		this.groupGeometries = createFlowGroupGeometriesFromElk(
			this.groups,
			hierarchy.groupElkIdByGroupId,
			boundsById,
		);
		if (this.edgeStyle === 'orthogonal') {
			this.orthogonalRoutes = extractElkLayoutOrthogonalRoutes(result);
			for (const edgeId of plan.reversedEdgeIds) {
				const route = this.orthogonalRoutes.get(edgeId);
				if (route) {
					this.orthogonalRoutes.set(edgeId, [...route].reverse());
				}
			}
			applyOrthogonalFlowEdges(graph, this.orthogonalRoutes);
		}
	}

	getOrthogonalRoutes(): OrthogonalRouteMap {
		return cloneOrthogonalRoutes(this.orthogonalRoutes);
	}

	getConflictCount(): number {
		return this.conflictCount;
	}

	getGroupGeometries(): FlowGroupGeometry[] {
		return this.groupGeometries.map((geometry) => ({ ...geometry }));
	}
}

function createFlowElkHierarchy(
	graph: RuntimeGraph,
	nodeLayoutOptions: ReadonlyMap<string, Record<string, string>>,
	groups: readonly ChartGroupDefinition[],
	groupByNode: ReadonlyMap<string, string>,
	flowLayoutOptions: Readonly<Record<string, string>>,
): FlowElkHierarchy {
	const nodeIds = graph
		.nodes()
		.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'));
	const occupiedIds = new Set(nodeIds);
	occupiedIds.add('root');
	const groupElkIdByGroupId = new Map<string, string>();
	const nodeIdsByGroup = new Map<string, string[]>();
	for (const nodeId of nodeIds) {
		const groupId = groupByNode.get(nodeId);
		if (!groupId) {
			continue;
		}
		const members = nodeIdsByGroup.get(groupId) ?? [];
		members.push(nodeId);
		nodeIdsByGroup.set(groupId, members);
	}

	const children: ElkNode[] = [];
	for (const [index, group] of groups.entries()) {
		const members = nodeIdsByGroup.get(group.id);
		if (!members?.length) {
			continue;
		}
		const elkId = createUniqueFlowGroupElkId(index, occupiedIds);
		groupElkIdByGroupId.set(group.id, elkId);
		children.push({
			id: elkId,
			layoutOptions: {
				...flowLayoutOptions,
				'elk.padding': createElkPadding(group.padding),
			},
			children: members.map((nodeId) =>
				createFlowElkNode(nodeId, nodeLayoutOptions),
			),
		});
	}
	for (const nodeId of nodeIds) {
		const groupId = groupByNode.get(nodeId);
		if (groupId && groupElkIdByGroupId.has(groupId)) {
			continue;
		}
		children.push(createFlowElkNode(nodeId, nodeLayoutOptions));
	}
	return { children, groupElkIdByGroupId };
}

function createFlowElkLayoutOptions(
	edgeStyle: FlowEdgeStyle,
	direction: FlowDirection,
	layerSpacing: number,
	laneSpacing: number,
): Record<string, string> {
	return {
		'elk.algorithm': 'layered',
		'elk.direction': toElkDirection(direction),
		'elk.spacing.nodeNode': String(60 * laneSpacing),
		'elk.layered.spacing.nodeNodeBetweenLayers': String(100 * layerSpacing),
		'elk.edgeRouting':
			edgeStyle === 'orthogonal' ? 'ORTHOGONAL' : 'POLYLINE',
	};
}

function createFlowElkNode(
	nodeId: string,
	nodeLayoutOptions: ReadonlyMap<string, Record<string, string>>,
): ElkNode {
	const layoutOptions = nodeLayoutOptions.get(nodeId);
	return {
		id: nodeId,
		width: FLOW_NODE_WIDTH,
		height: FLOW_NODE_HEIGHT,
		...(layoutOptions ? { layoutOptions } : {}),
	};
}

function createUniqueFlowGroupElkId(
	index: number,
	occupiedIds: Set<string>,
): string {
	const base = `__meta_graph_flow_group_${index + 1}__`;
	let id = base;
	let suffix = 2;
	while (occupiedIds.has(id)) {
		id = `${base}_${suffix}`;
		suffix += 1;
	}
	occupiedIds.add(id);
	return id;
}

function createElkPadding(padding: number): string {
	const value =
		FLOW_GROUP_BASE_PADDING +
		scaleLayoutGroupPadding(padding) * FLOW_GROUP_EXTRA_PADDING;
	const formatted = value.toFixed(2);
	return `[top=${formatted},left=${formatted},bottom=${formatted},right=${formatted}]`;
}

function collectElkNodeBounds(root: ElkNode): Map<string, ElkNodeBounds> {
	const bounds = new Map<string, ElkNodeBounds>();
	const visit = (node: ElkNode, parent: ElkPoint): void => {
		const x = parent.x + (node.x ?? 0);
		const y = parent.y + (node.y ?? 0);
		bounds.set(node.id, {
			x,
			y,
			width: node.width ?? 0,
			height: node.height ?? 0,
		});
		for (const child of node.children ?? []) {
			visit(child, { x, y });
		}
	};
	visit(root, { x: 0, y: 0 });
	return bounds;
}

function createFlowGroupGeometriesFromElk(
	groups: readonly ChartGroupDefinition[],
	groupElkIdByGroupId: ReadonlyMap<string, string>,
	boundsById: ReadonlyMap<string, ElkNodeBounds>,
): FlowGroupGeometry[] {
	return groups.flatMap((group) => {
		const elkId = groupElkIdByGroupId.get(group.id);
		const bounds = elkId ? boundsById.get(elkId) : undefined;
		if (!bounds) {
			return [];
		}
		return [
			{
				kind: 'flow-container' as const,
				groupId: group.id,
				name: group.name,
				color: group.color,
				...bounds,
			},
		];
	});
}

export function createFlowGroupGeometriesFromGraph(
	graph: RuntimeGraph,
	groups: readonly ChartGroupDefinition[],
	groupByNode: ReadonlyMap<string, string>,
): FlowGroupGeometry[] {
	const positionsByGroup = new Map<string, ElkPoint[]>();
	for (const nodeId of graph.nodes()) {
		if (graph.getNodeAttribute(nodeId, 'isBend')) {
			continue;
		}
		const groupId = groupByNode.get(nodeId);
		if (!groupId) {
			continue;
		}
		const positions = positionsByGroup.get(groupId) ?? [];
		const attributes = graph.getNodeAttributes(nodeId);
		positions.push({ x: attributes.x, y: attributes.y });
		positionsByGroup.set(groupId, positions);
	}
	return groups.flatMap((group) => {
		const positions = positionsByGroup.get(group.id);
		if (!positions?.length) {
			return [];
		}
		const padding =
			FLOW_GROUP_BASE_PADDING +
			scaleLayoutGroupPadding(group.padding) * FLOW_GROUP_EXTRA_PADDING;
		const left = Math.min(
			...positions.map((position) => position.x - FLOW_NODE_WIDTH / 2),
		);
		const right = Math.max(
			...positions.map((position) => position.x + FLOW_NODE_WIDTH / 2),
		);
		const top = Math.min(
			...positions.map((position) => position.y - FLOW_NODE_HEIGHT / 2),
		);
		const bottom = Math.max(
			...positions.map((position) => position.y + FLOW_NODE_HEIGHT / 2),
		);
		return [
			{
				kind: 'flow-container' as const,
				groupId: group.id,
				name: group.name,
				color: group.color,
				x: left - padding,
				y: top - padding,
				width: right - left + padding * 2,
				height: bottom - top + padding * 2,
			},
		];
	});
}

export function toElkDirection(
	direction: FlowDirection,
): 'RIGHT' | 'LEFT' | 'DOWN' | 'UP' {
	switch (direction) {
		case 'LR':
			return 'RIGHT';
		case 'RL':
			return 'LEFT';
		case 'TD':
			return 'DOWN';
		case 'DT':
			return 'UP';
	}
}

export function applyElkOrthogonalRoutes(
	graph: RuntimeGraph,
	elkEdges: ElkExtendedEdge[],
): void {
	applyOrthogonalFlowEdges(graph, extractElkOrthogonalRoutes(elkEdges));
}

export function extractElkOrthogonalRoutes(
	elkEdges: ElkExtendedEdge[],
): OrthogonalRouteMap {
	return new Map(
		elkEdges.map((edge) => [
			edge.id,
			extractElkEdgePoints(edge, { x: 0, y: 0 }),
		]),
	);
}

export function extractElkLayoutOrthogonalRoutes(
	root: ElkNode,
): OrthogonalRouteMap {
	const boundsById = collectElkNodeBounds(root);
	const routes: OrthogonalRouteMap = new Map();
	const visit = (node: ElkNode): void => {
		for (const edge of node.edges ?? []) {
			const container = boundsById.get(edge.container ?? node.id);
			routes.set(
				edge.id,
				extractElkEdgePoints(edge, {
					x: container?.x ?? 0,
					y: container?.y ?? 0,
				}),
			);
		}
		for (const child of node.children ?? []) {
			visit(child);
		}
	};
	visit(root);
	return routes;
}

function extractElkEdgePoints(
	edge: ElkExtendedEdge,
	offset: ElkPoint,
): ElkPoint[] {
	return (
		edge.sections?.flatMap((section) =>
			[
				section.startPoint,
				...(section.bendPoints ?? []),
				section.endPoint,
			].map((point) => ({
				x: point.x + offset.x,
				y: point.y + offset.y,
			})),
		) ?? []
	);
}

export function cloneOrthogonalRoutes(
	routes: ReadonlyMap<string, ElkPoint[]>,
): OrthogonalRouteMap {
	return new Map(
		[...routes].map(([edgeId, points]) => [
			edgeId,
			points.map((point) => ({ ...point })),
		]),
	);
}

export function applyOrthogonalFlowEdges(
	graph: RuntimeGraph,
	routes: ReadonlyMap<string, ElkPoint[]> = new Map(),
): void {
	const logicalEdges = graph
		.edges()
		.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden'));

	for (const edge of logicalEdges) {
		const source = graph.source(edge);
		const target = graph.target(edge);
		const directed = graph.isDirected(edge);
		const sourceAttributes = graph.getNodeAttributes(source);
		const targetAttributes = graph.getNodeAttributes(target);
		const attributes = graph.getEdgeAttributes(edge);

		const route = routes.get(edge);
		const points = deduplicatePoints(
			route && route.length > 0
				? [
						{ x: sourceAttributes.x, y: sourceAttributes.y },
						...route,
						{ x: targetAttributes.x, y: targetAttributes.y },
					]
				: createFallbackRoute(sourceAttributes, targetAttributes),
		);
		if (points.length < 2) {
			continue;
		}

		graph.dropEdge(edge);
		const segmentAttributes = {
			...attributes,
			type:
				attributes.lineStyle === 'solid'
					? 'line'
					: attributes.lineStyle,
			label: '',
			forceLabel: false,
			logicalEdgeId: edge,
			logicalSource: source,
			logicalTarget: target,
		};
		const pathNodes = [source];
		for (const [index, point] of points.slice(1, -1).entries()) {
			const bendNode = `__flow-bend__${edge}__${index + 1}`;
			graph.addNode(bendNode, createBendNode(point.x, point.y));
			pathNodes.push(bendNode);
		}
		pathNodes.push(target);

		for (let index = 0; index < pathNodes.length - 1; index += 1) {
			const segmentSource = pathNodes[index];
			const segmentTarget = pathNodes[index + 1];
			if (!segmentSource || !segmentTarget) {
				continue;
			}
			const lastSegment = index === pathNodes.length - 2;
			const labelSegment = Math.floor((pathNodes.length - 2) / 2);
			const segmentKey = `${edge}__segment_${index + 1}`;
			const styledSegment = {
				...segmentAttributes,
				type:
					directed && lastSegment
						? attributes.lineStyle === 'solid'
							? 'arrow'
							: `${attributes.lineStyle}-arrow`
						: attributes.lineStyle === 'solid'
							? 'line'
							: attributes.lineStyle,
				label: index === labelSegment ? attributes.label : '',
				forceLabel: index === labelSegment && Boolean(attributes.label),
			};
			if (directed) {
				graph.addDirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					styledSegment,
				);
			} else {
				graph.addUndirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					styledSegment,
				);
			}
		}
	}
}

function createFallbackRoute(
	source: { x: number; y: number },
	target: { x: number; y: number },
): ElkPoint[] {
	if (Math.abs(source.y - target.y) < 0.001) {
		return [source, target];
	}
	const middleX = (source.x + target.x) / 2;
	return [
		source,
		{ x: middleX, y: source.y },
		{ x: middleX, y: target.y },
		target,
	];
}

function deduplicatePoints(points: ElkPoint[]): ElkPoint[] {
	return points.filter((point, index) => {
		const previous = points[index - 1];
		return (
			!previous ||
			Math.abs(previous.x - point.x) > 0.001 ||
			Math.abs(previous.y - point.y) > 0.001
		);
	});
}

function createBendNode(x: number, y: number) {
	return {
		label: '',
		x,
		y,
		size: 0.01,
		color: 'rgba(0, 0, 0, 0)',
		path: '',
		folder: '',
		domains: [],
		tags: [],
		fixed: true,
		isBend: true,
	};
}
