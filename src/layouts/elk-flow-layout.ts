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
import {
	getEdgeType,
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
} from '../graph/model/graphology-adapter';
import { createFlowLayoutPlan } from './flow-relation-layout';
import {
	scaleLayoutGroupPadding,
	type FlowGroupGeometry,
} from './group-geometry';
import type { LayoutEngine } from './layout-engine';
import { offsetParallelFlowRoute } from './parallel-routes';

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
		private readonly cornerRadius = 0,
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
		if (
			this.edgeStyle === 'orthogonal' ||
			this.edgeStyle === 'curve' ||
			this.edgeStyle === 'bundled'
		) {
			this.orthogonalRoutes = extractElkLayoutOrthogonalRoutes(result);
			for (const edgeId of plan.reversedEdgeIds) {
				const route = this.orthogonalRoutes.get(edgeId);
				if (route) {
					this.orthogonalRoutes.set(edgeId, [...route].reverse());
				}
			}
			if (this.edgeStyle === 'orthogonal') {
				applyOrthogonalFlowEdges(
					graph,
					this.orthogonalRoutes,
					this.cornerRadius,
				);
			} else if (this.edgeStyle === 'curve') {
				applyCurvedFlowEdges(
					graph,
					this.orthogonalRoutes,
					this.direction,
				);
			}
		} else {
			this.orthogonalRoutes = new Map();
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
			edgeStyle === 'orthogonal' || edgeStyle === 'bundled'
				? 'ORTHOGONAL'
				: 'POLYLINE',
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

interface BundledFlowEdgeRecord {
	id: string;
	source: string;
	target: string;
	sourcePoint: ElkPoint;
	targetPoint: ElkPoint;
	sourceLayer: number;
	targetLayer: number;
	compatibilityKey: string;
}

interface BundledFlowGroup {
	key: string;
	kind: 'fan-out' | 'fan-in';
	records: BundledFlowEdgeRecord[];
}

interface FlowBundleCorridor {
	lane: number;
	primaryStart: number;
	primaryEnd: number;
}

interface FlowAxis {
	horizontal: boolean;
	primary(point: ElkPoint): number;
	cross(point: ElkPoint): number;
	point(primary: number, cross: number): ElkPoint;
}

const FLOW_LAYOUT_EPSILON = 0.5;
const FLOW_BUNDLE_ENDPOINT_GAP = 8;
const FLOW_BUNDLE_NODE_CLEARANCE = 6;
const FLOW_BUNDLE_CORRIDOR_GAP = 12;
const FLOW_BUNDLE_MIN_EDGE_COUNT = 2;
const FLOW_CORNER_STEPS = 4;
const FLOW_CURVE_CORNER_RATIO = 0.25;
const FLOW_CURVE_MIN_CORNER_RADIUS = 12;
const FLOW_CURVE_MAX_CORNER_RADIUS = 48;
const FLOW_CURVE_OFFSET_RATIO = 0.2;
const FLOW_CURVE_MIN_OFFSET = 12;
const FLOW_CURVE_MAX_OFFSET = 48;
const FLOW_CURVE_STEPS = 4;
const FLOW_DIRECT_CURVE_STEPS = 8;
const FLOW_ROUTE_POINT_EPSILON = 0.01;

export function createBundledFlowRoutes(
	graph: RuntimeGraph,
	baseRoutes: ReadonlyMap<string, ElkPoint[]> = new Map(),
	direction: FlowDirection = 'LR',
): OrthogonalRouteMap {
	const axis = createFlowAxis(direction);
	const nodeIds = graph
		.nodes()
		.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'));
	const layerCoordinates = createFlowLayerCoordinates(graph, nodeIds, axis);
	const records = graph.edges().flatMap((edge): BundledFlowEdgeRecord[] => {
		const attributes = graph.getEdgeAttributes(edge);
		if (attributes.hidden || attributes.logicalEdgeId) {
			return [];
		}
		const source = graph.source(edge);
		const target = graph.target(edge);
		if (!graph.hasNode(source) || !graph.hasNode(target)) {
			return [];
		}
		const sourceAttributes = graph.getNodeAttributes(source);
		const targetAttributes = graph.getNodeAttributes(target);
		const directed = graph.isDirected(edge);
		return [
			{
				id: edge,
				source,
				target,
				sourcePoint: { x: sourceAttributes.x, y: sourceAttributes.y },
				targetPoint: { x: targetAttributes.x, y: targetAttributes.y },
				sourceLayer: findFlowLayerIndex(
					axis.primary(sourceAttributes),
					layerCoordinates,
				),
				targetLayer: findFlowLayerIndex(
					axis.primary(targetAttributes),
					layerCoordinates,
				),
				compatibilityKey: createFlowEdgeCompatibilityKey(
					attributes,
					directed,
				),
			},
		];
	});

	const bundledRoutes = new Map<string, ElkPoint[]>();
	const claimedEdgeIds = new Set<string>();
	const corridors: FlowBundleCorridor[] = [];
	for (const group of createBundledFlowGroups(records)) {
		const availableRecords = group.records.filter(
			(record) => !claimedEdgeIds.has(record.id),
		);
		if (
			availableRecords.length < FLOW_BUNDLE_MIN_EDGE_COUNT ||
			!hasDistinctBundleEndpoints(group.kind, availableRecords)
		) {
			continue;
		}
		const lane = chooseBundleLane(
			availableRecords,
			graph,
			nodeIds,
			axis,
			corridors,
		);
		if (lane === undefined) {
			continue;
		}
		corridors.push(lane);
		for (const record of availableRecords) {
			claimedEdgeIds.add(record.id);
			bundledRoutes.set(
				record.id,
				createBundledFlowRoute(record, lane.lane, axis),
			);
		}
	}

	const routes = new Map<string, ElkPoint[]>();
	for (const record of records) {
		const route = bundledRoutes.get(record.id) ?? baseRoutes.get(record.id);
		routes.set(
			record.id,
			route
				? route.map((point) => ({ ...point }))
				: createFallbackRoute(record.sourcePoint, record.targetPoint),
		);
	}
	return routes;
}

function createBundledFlowGroups(
	records: readonly BundledFlowEdgeRecord[],
): BundledFlowGroup[] {
	const groups = new Map<string, BundledFlowGroup>();
	for (const record of records) {
		if (
			record.sourceLayer < 0 ||
			record.targetLayer < 0 ||
			record.sourceLayer === record.targetLayer
		) {
			continue;
		}
		const candidates: Array<readonly [BundledFlowGroup['kind'], string]> = [
			['fan-out', record.source],
			['fan-in', record.target],
		];
		for (const [kind, anchor] of candidates) {
			const key = JSON.stringify([
				kind,
				anchor,
				record.sourceLayer,
				record.targetLayer,
				record.compatibilityKey,
			]);
			const group = groups.get(key) ?? { key, kind, records: [] };
			group.records.push(record);
			groups.set(key, group);
		}
	}
	return [...groups.values()]
		.filter((group) => group.records.length >= FLOW_BUNDLE_MIN_EDGE_COUNT)
		.sort(
			(left, right) =>
				right.records.length - left.records.length ||
				left.key.localeCompare(right.key),
		);
}

function hasDistinctBundleEndpoints(
	kind: BundledFlowGroup['kind'],
	records: readonly BundledFlowEdgeRecord[],
): boolean {
	const endpointIds = new Set(
		records.map((record) =>
			kind === 'fan-out' ? record.target : record.source,
		),
	);
	return endpointIds.size >= FLOW_BUNDLE_MIN_EDGE_COUNT;
}

function createFlowEdgeCompatibilityKey(
	attributes: RuntimeEdgeAttributes,
	directed: boolean,
): string {
	return JSON.stringify([
		directed,
		attributes.relation,
		attributes.kind,
		attributes.semantic,
		attributes.lineStyle,
		attributes.color,
		attributes.size,
		attributes.arrowStyle,
		attributes.arrowSize,
	]);
}

export function applyOrthogonalFlowEdges(
	graph: RuntimeGraph,
	routes: ReadonlyMap<string, ElkPoint[]> = new Map(),
	cornerRadius = 0,
): void {
	if (cornerRadius <= FLOW_ROUTE_POINT_EPSILON) {
		applyRoutedFlowEdges(graph, routes, 'middle');
		return;
	}
	applyRoutedFlowEdges(graph, routes, 'middle', (route) =>
		roundOrthogonalRoute(route, cornerRadius),
	);
}

export function applyCurvedFlowEdges(
	graph: RuntimeGraph,
	routes: ReadonlyMap<string, ElkPoint[]> = new Map(),
	direction: FlowDirection = 'LR',
): void {
	applyRoutedFlowEdges(
		graph,
		routes,
		'middle',
		(route, source, target, edgeId) =>
			createCurvedFlowRoute(route, source, target, direction, edgeId),
	);
}

export function applyBundledFlowEdges(
	graph: RuntimeGraph,
	routes: ReadonlyMap<string, ElkPoint[]> = new Map(),
	cornerRadius = 0,
): void {
	if (cornerRadius <= FLOW_ROUTE_POINT_EPSILON) {
		applyRoutedFlowEdges(graph, routes, 'target-branch');
		return;
	}
	applyRoutedFlowEdges(graph, routes, 'target-branch', (route) =>
		roundOrthogonalRoute(route, cornerRadius),
	);
}

function applyRoutedFlowEdges(
	graph: RuntimeGraph,
	routes: ReadonlyMap<string, ElkPoint[]>,
	labelPlacement: 'middle' | 'target-branch',
	transformRoute: RouteTransform = (route) => route,
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
		const sourcePoint = { x: sourceAttributes.x, y: sourceAttributes.y };
		const targetPoint = { x: targetAttributes.x, y: targetAttributes.y };
		const baseRoute =
			route && route.length > 0
				? route
				: createFallbackRoute(sourceAttributes, targetAttributes);
		const routedPoints = transformRoute(
			offsetParallelFlowRoute(
				baseRoute,
				sourcePoint,
				targetPoint,
				attributes,
			),
			sourcePoint,
			targetPoint,
			edge,
		);
		const points = deduplicatePoints(
			routedPoints.length > 0
				? [sourcePoint, ...routedPoints, targetPoint]
				: [sourcePoint, targetPoint],
		);
		if (points.length < 2) {
			continue;
		}

		graph.dropEdge(edge);
		const segmentAttributes = {
			...attributes,
			type: getEdgeType(
				attributes.lineStyle,
				false,
				attributes.arrowStyle,
			),
			label: '',
			forceLabel: false,
			logicalEdgeId: edge,
			logicalSource: source,
			logicalTarget: target,
			flowLabelPlacement: labelPlacement,
		};
		const pathNodes = [source];
		for (const [index, point] of points.slice(1, -1).entries()) {
			const bendNode = `__flow-bend__${edge}__${index + 1}`;
			graph.addNode(bendNode, createBendNode(point.x, point.y));
			pathNodes.push(bendNode);
		}
		pathNodes.push(target);
		const arrowSegmentIndex = directed
			? getFlowArrowSegmentIndex(points, attributes)
			: -1;
		const labelSegment =
			labelPlacement === 'target-branch'
				? Math.max(0, pathNodes.length - 3)
				: Math.floor((pathNodes.length - 2) / 2);

		for (let index = 0; index < pathNodes.length - 1; index += 1) {
			const segmentSource = pathNodes[index];
			const segmentTarget = pathNodes[index + 1];
			if (!segmentSource || !segmentTarget) {
				continue;
			}
			const arrowSegment = index === arrowSegmentIndex;
			const segmentKey = `${edge}__segment_${index + 1}`;
			const styledSegment = {
				...segmentAttributes,
				type: getEdgeType(
					attributes.lineStyle,
					directed && arrowSegment,
					attributes.arrowStyle,
				),
				...(directed ? { flowArrowSegment: arrowSegment } : {}),
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

type RouteTransform = (
	route: ElkPoint[],
	source: ElkPoint,
	target: ElkPoint,
	edgeId: string,
) => ElkPoint[];

function createCurvedFlowRoute(
	points: ElkPoint[],
	source: ElkPoint,
	target: ElkPoint,
	direction: FlowDirection,
	edgeId: string,
): ElkPoint[] {
	const pathPoints = deduplicatePoints([source, ...points, target]);
	if (pathPoints.length < 2) {
		return [];
	}
	const hasCorner = pathPoints
		.slice(1, -1)
		.some((point, index) =>
			isCurveCorner(pathPoints[index]!, point, pathPoints[index + 2]!),
		);
	if (pathPoints.length === 2 || !hasCorner) {
		return createDirectCurveRoute(source, target, direction, edgeId);
	}

	const curvedPoints: ElkPoint[] = [pathPoints[0]!];
	for (let index = 1; index < pathPoints.length - 1; index += 1) {
		const previous = pathPoints[index - 1]!;
		const current = pathPoints[index]!;
		const next = pathPoints[index + 1]!;
		if (!isCurveCorner(previous, current, next)) {
			curvedPoints.push(current);
			continue;
		}

		const incomingLength = distanceBetween(previous, current);
		const outgoingLength = distanceBetween(current, next);
		const radius = Math.min(
			incomingLength / 2,
			outgoingLength / 2,
			Math.max(
				FLOW_CURVE_MIN_CORNER_RADIUS,
				Math.min(
					FLOW_CURVE_MAX_CORNER_RADIUS,
					Math.min(incomingLength, outgoingLength) *
						FLOW_CURVE_CORNER_RATIO,
				),
			),
		);
		if (radius <= FLOW_ROUTE_POINT_EPSILON) {
			curvedPoints.push(current);
			continue;
		}

		const entering = movePointToward(current, previous, radius);
		const leaving = movePointToward(current, next, radius);
		curvedPoints.push(entering);
		for (let step = 1; step < FLOW_CURVE_STEPS; step += 1) {
			curvedPoints.push(
				quadraticPoint(
					entering,
					current,
					leaving,
					step / FLOW_CURVE_STEPS,
				),
			);
		}
		curvedPoints.push(leaving);
	}
	curvedPoints.push(pathPoints.at(-1)!);
	return curvedPoints.slice(1, -1);
}

function createDirectCurveRoute(
	source: ElkPoint,
	target: ElkPoint,
	direction: FlowDirection,
	edgeId: string,
): ElkPoint[] {
	const length = distanceBetween(source, target);
	if (length <= FLOW_ROUTE_POINT_EPSILON) {
		return [];
	}
	const midpoint = {
		x: (source.x + target.x) / 2,
		y: (source.y + target.y) / 2,
	};
	const offset = Math.min(
		FLOW_CURVE_MAX_OFFSET,
		Math.max(FLOW_CURVE_MIN_OFFSET, length * FLOW_CURVE_OFFSET_RATIO),
	);
	const side = getCurveSide(edgeId);
	const horizontal = direction === 'LR' || direction === 'RL';
	const control = horizontal
		? { x: midpoint.x, y: midpoint.y + offset * side }
		: { x: midpoint.x + offset * side, y: midpoint.y };
	const curvedPoints: ElkPoint[] = [];
	for (let step = 1; step < FLOW_DIRECT_CURVE_STEPS; step += 1) {
		curvedPoints.push(
			quadraticPoint(
				source,
				control,
				target,
				step / FLOW_DIRECT_CURVE_STEPS,
			),
		);
	}
	return curvedPoints;
}

function isCurveCorner(
	previous: ElkPoint,
	current: ElkPoint,
	next: ElkPoint,
): boolean {
	const incoming = {
		x: current.x - previous.x,
		y: current.y - previous.y,
	};
	const outgoing = {
		x: next.x - current.x,
		y: next.y - current.y,
	};
	const incomingLength = Math.hypot(incoming.x, incoming.y);
	const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
	if (
		incomingLength <= FLOW_ROUTE_POINT_EPSILON ||
		outgoingLength <= FLOW_ROUTE_POINT_EPSILON
	) {
		return false;
	}
	const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
	return (
		Math.abs(cross) / (incomingLength * outgoingLength) >
		FLOW_ROUTE_POINT_EPSILON
	);
}

function getCurveSide(edgeId: string): 1 | -1 {
	let hash = 0;
	for (let index = 0; index < edgeId.length; index += 1) {
		hash = (hash * 31 + edgeId.charCodeAt(index)) | 0;
	}
	return Math.abs(hash) % 2 === 0 ? 1 : -1;
}

function roundOrthogonalRoute(
	points: ElkPoint[],
	cornerRadius: number,
): ElkPoint[] {
	const sourcePoints = deduplicatePoints(points);
	const requestedRadius = Math.max(0, cornerRadius);
	if (
		sourcePoints.length < 3 ||
		requestedRadius <= FLOW_ROUTE_POINT_EPSILON
	) {
		return sourcePoints;
	}

	const roundedPoints: ElkPoint[] = [sourcePoints[0]!];
	for (let index = 1; index < sourcePoints.length - 1; index += 1) {
		const previous = sourcePoints[index - 1]!;
		const current = sourcePoints[index]!;
		const next = sourcePoints[index + 1]!;
		if (!isOrthogonalCorner(previous, current, next)) {
			roundedPoints.push(current);
			continue;
		}

		const incomingLength = distanceBetween(previous, current);
		const outgoingLength = distanceBetween(current, next);
		const radius = Math.min(
			requestedRadius,
			incomingLength / 2,
			outgoingLength / 2,
		);
		if (radius <= FLOW_ROUTE_POINT_EPSILON) {
			roundedPoints.push(current);
			continue;
		}

		const entering = movePointToward(current, previous, radius);
		const leaving = movePointToward(current, next, radius);
		roundedPoints.push(entering);
		for (let step = 1; step < FLOW_CORNER_STEPS; step += 1) {
			roundedPoints.push(
				quadraticPoint(
					entering,
					current,
					leaving,
					step / FLOW_CORNER_STEPS,
				),
			);
		}
		roundedPoints.push(leaving);
	}
	roundedPoints.push(sourcePoints.at(-1)!);
	return deduplicatePoints(roundedPoints);
}

function isOrthogonalCorner(
	previous: ElkPoint,
	current: ElkPoint,
	next: ElkPoint,
): boolean {
	const incomingHorizontal = approximatelyEqual(previous.y, current.y);
	const incomingVertical = approximatelyEqual(previous.x, current.x);
	const outgoingHorizontal = approximatelyEqual(current.y, next.y);
	const outgoingVertical = approximatelyEqual(current.x, next.x);
	return (
		(incomingHorizontal && outgoingVertical) ||
		(incomingVertical && outgoingHorizontal)
	);
}

function distanceBetween(left: ElkPoint, right: ElkPoint): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

function movePointToward(
	from: ElkPoint,
	to: ElkPoint,
	distance: number,
): ElkPoint {
	const length = distanceBetween(from, to);
	if (length <= FLOW_ROUTE_POINT_EPSILON) {
		return { ...from };
	}
	const ratio = distance / length;
	return {
		x: from.x + (to.x - from.x) * ratio,
		y: from.y + (to.y - from.y) * ratio,
	};
}

function quadraticPoint(
	start: ElkPoint,
	control: ElkPoint,
	end: ElkPoint,
	t: number,
): ElkPoint {
	const inverse = 1 - t;
	return {
		x:
			inverse * inverse * start.x +
			2 * inverse * t * control.x +
			t * t * end.x,
		y:
			inverse * inverse * start.y +
			2 * inverse * t * control.y +
			t * t * end.y,
	};
}

function approximatelyEqual(left: number, right: number): boolean {
	return Math.abs(left - right) <= FLOW_ROUTE_POINT_EPSILON;
}

function createFlowAxis(direction: FlowDirection): FlowAxis {
	if (direction === 'LR' || direction === 'RL') {
		return {
			horizontal: true,
			primary: (point) => point.x,
			cross: (point) => point.y,
			point: (primary, cross) => ({ x: primary, y: cross }),
		};
	}

	return {
		horizontal: false,
		primary: (point) => point.y,
		cross: (point) => point.x,
		point: (primary, cross) => ({ x: cross, y: primary }),
	};
}

function createFlowLayerCoordinates(
	graph: RuntimeGraph,
	nodeIds: readonly string[],
	axis: FlowAxis,
): number[] {
	const coordinates = nodeIds
		.map((nodeId) => {
			const attributes = graph.getNodeAttributes(nodeId);
			return axis.primary({ x: attributes.x, y: attributes.y });
		})
		.sort((left, right) => left - right);
	const layers: number[] = [];
	for (const coordinate of coordinates) {
		const previous = layers.at(-1);
		if (
			previous === undefined ||
			coordinate - previous > FLOW_LAYOUT_EPSILON
		) {
			layers.push(coordinate);
		}
	}
	return layers;
}

function findFlowLayerIndex(
	value: number,
	coordinates: readonly number[],
): number {
	let closestIndex = -1;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (const [index, coordinate] of coordinates.entries()) {
		const distance = Math.abs(coordinate - value);
		if (distance < closestDistance) {
			closestIndex = index;
			closestDistance = distance;
		}
	}
	return closestIndex;
}

function chooseBundleLane(
	group: readonly BundledFlowEdgeRecord[],
	graph: RuntimeGraph,
	nodeIds: readonly string[],
	axis: FlowAxis,
	corridors: readonly FlowBundleCorridor[],
): FlowBundleCorridor | undefined {
	const halfPrimary = axis.horizontal
		? FLOW_NODE_WIDTH / 2
		: FLOW_NODE_HEIGHT / 2;
	const halfCross = axis.horizontal
		? FLOW_NODE_HEIGHT / 2
		: FLOW_NODE_WIDTH / 2;
	const primaryValues = group.flatMap((record) => [
		axis.primary(record.sourcePoint),
		axis.primary(record.targetPoint),
	]);
	const primaryStart =
		Math.min(...primaryValues) + halfPrimary + FLOW_BUNDLE_ENDPOINT_GAP;
	const primaryEnd =
		Math.max(...primaryValues) - halfPrimary - FLOW_BUNDLE_ENDPOINT_GAP;
	if (primaryEnd <= primaryStart) {
		return undefined;
	}

	const crossCoordinates = nodeIds
		.map((nodeId) => {
			const attributes = graph.getNodeAttributes(nodeId);
			return axis.cross({ x: attributes.x, y: attributes.y });
		})
		.sort((left, right) => left - right);
	if (crossCoordinates.length === 0) {
		return undefined;
	}

	const candidates: number[] = [];
	const laneClearance = halfCross + FLOW_BUNDLE_NODE_CLEARANCE;
	for (let index = 0; index < crossCoordinates.length - 1; index += 1) {
		const current = crossCoordinates[index];
		const next = crossCoordinates[index + 1];
		if (current === undefined || next === undefined) {
			continue;
		}
		if (next - current >= laneClearance * 2) {
			candidates.push((current + next) / 2);
		}
	}
	const minimumCross = crossCoordinates[0];
	const maximumCross = crossCoordinates.at(-1);
	if (minimumCross !== undefined && maximumCross !== undefined) {
		candidates.push(
			minimumCross - laneClearance,
			maximumCross + laneClearance,
		);
	}

	const desiredCross =
		group.reduce(
			(total, record) =>
				total +
				axis.cross(record.sourcePoint) +
				axis.cross(record.targetPoint),
			0,
		) /
		(group.length * 2);
	const lane = candidates
		.filter((candidate, index, all) => all.indexOf(candidate) === index)
		.filter((candidate) =>
			isBundleLaneClear(
				candidate,
				primaryStart,
				primaryEnd,
				graph,
				nodeIds,
				axis,
				halfPrimary,
				halfCross,
			),
		)
		.filter((candidate) =>
			isBundleCorridorClear(
				candidate,
				primaryStart,
				primaryEnd,
				corridors,
			),
		)
		.sort(
			(left, right) =>
				Math.abs(left - desiredCross) - Math.abs(right - desiredCross),
		)[0];
	return lane === undefined ? undefined : { lane, primaryStart, primaryEnd };
}

function isBundleCorridorClear(
	lane: number,
	primaryStart: number,
	primaryEnd: number,
	corridors: readonly FlowBundleCorridor[],
): boolean {
	return corridors.every((corridor) => {
		const primaryRangesOverlap =
			primaryStart < corridor.primaryEnd &&
			primaryEnd > corridor.primaryStart;
		return (
			!primaryRangesOverlap ||
			Math.abs(lane - corridor.lane) >= FLOW_BUNDLE_CORRIDOR_GAP
		);
	});
}

function isBundleLaneClear(
	lane: number,
	primaryStart: number,
	primaryEnd: number,
	graph: RuntimeGraph,
	nodeIds: readonly string[],
	axis: FlowAxis,
	halfPrimary: number,
	halfCross: number,
): boolean {
	for (const nodeId of nodeIds) {
		const attributes = graph.getNodeAttributes(nodeId);
		const point = { x: attributes.x, y: attributes.y };
		const primary = axis.primary(point);
		if (
			primary + halfPrimary <= primaryStart ||
			primary - halfPrimary >= primaryEnd
		) {
			continue;
		}
		if (
			Math.abs(axis.cross(point) - lane) <
			halfCross + FLOW_BUNDLE_NODE_CLEARANCE
		) {
			return false;
		}
	}
	return true;
}

function createBundledFlowRoute(
	record: BundledFlowEdgeRecord,
	lane: number,
	axis: FlowAxis,
): ElkPoint[] {
	const halfPrimary = axis.horizontal
		? FLOW_NODE_WIDTH / 2
		: FLOW_NODE_HEIGHT / 2;
	const sourcePrimary = axis.primary(record.sourcePoint);
	const targetPrimary = axis.primary(record.targetPoint);
	const travelDirection = targetPrimary >= sourcePrimary ? 1 : -1;
	const sourceBranchPrimary =
		sourcePrimary +
		travelDirection * (halfPrimary + FLOW_BUNDLE_ENDPOINT_GAP);
	const targetBranchPrimary =
		targetPrimary -
		travelDirection * (halfPrimary + FLOW_BUNDLE_ENDPOINT_GAP);
	return [
		axis.point(sourceBranchPrimary, axis.cross(record.sourcePoint)),
		axis.point(sourceBranchPrimary, lane),
		axis.point(targetBranchPrimary, lane),
		axis.point(targetBranchPrimary, axis.cross(record.targetPoint)),
	];
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

/**
 * Parallel Flow lanes attach to each node with a short perpendicular branch.
 * Put the arrow on the last axis-aligned corridor segment, not on that branch,
 * so RL/LR arrows remain horizontal (and TD/DT arrows remain vertical).
 */
function getFlowArrowSegmentIndex(
	points: readonly ElkPoint[],
	attributes: RuntimeEdgeAttributes,
): number {
	const lastSegment = points.length - 2;
	if (
		lastSegment < 0 ||
		(attributes.parallelCount ?? 1) <= 1 ||
		Math.abs(attributes.parallelLane ?? 0) <= FLOW_ROUTE_POINT_EPSILON
	) {
		return lastSegment;
	}

	const source = points[0];
	const target = points.at(-1);
	if (!source || !target) {
		return lastSegment;
	}
	const horizontal =
		Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
	for (let index = lastSegment - 1; index >= 0; index -= 1) {
		const from = points[index];
		const to = points[index + 1];
		if (!from || !to) {
			continue;
		}
		const dx = Math.abs(to.x - from.x);
		const dy = Math.abs(to.y - from.y);
		if (horizontal ? dx >= dy : dy > dx) {
			return index;
		}
	}
	return Math.max(0, lastSegment - 1);
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
