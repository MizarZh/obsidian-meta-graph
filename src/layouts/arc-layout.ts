import { scalePoint } from 'd3-scale';
import type {
	ArcDirection,
	ArcLabelAngle,
	ChartGroupDefinition,
} from '../core/types';
import {
	getEdgeType,
	type RuntimeGraph,
} from '../graph/model/graphology-adapter';
import { getParallelLane } from '../graph/model/parallel-edges';
import type { LayoutEngine } from './layout-engine';
import {
	scaleLayoutGroupPadding,
	type ArcGroupGeometry,
} from './group-geometry';
import {
	compareLayoutNodeIds,
	type LayoutNodeSort,
	type LayoutSortDirection,
} from './node-ordering';

export interface ArcPoint {
	x: number;
	y: number;
}

export class ArcLayout implements LayoutEngine {
	private groupGeometries: ArcGroupGeometry[] = [];

	constructor(
		private readonly spacing = 1,
		private readonly direction: ArcDirection = 'right',
		private readonly nodeSort: LayoutNodeSort = 'name',
		private readonly nodeSortDirection: LayoutSortDirection = 'asc',
		private readonly labelAngle: ArcLabelAngle = 'auto',
		private readonly groups: readonly ChartGroupDefinition[] = [],
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const nodeIds = sortArcNodeIds(
			graph,
			this.nodeSort,
			this.nodeSortDirection,
			this.groups,
			this.groupByNode,
		);
		const step = calculateArcStep(graph, nodeIds, this.spacing);
		const length = Math.max(0, (nodeIds.length - 1) * step);
		const axis = scalePoint<string>()
			.domain(nodeIds)
			.range([-length / 2, length / 2]);
		const labelPlacement = getArcLabelPlacement(
			this.direction,
			this.labelAngle,
		);

		for (const nodeId of nodeIds) {
			const axisPosition = axis(nodeId) ?? 0;
			graph.mergeNodeAttributes(nodeId, {
				x: isVerticalArc(this.direction) ? 0 : axisPosition,
				y: isVerticalArc(this.direction) ? axisPosition : 0,
				fixed: true,
				labelRotation: labelPlacement.rotation,
				labelDirection: labelPlacement.direction,
			});
		}
		this.groupGeometries = createArcGroupGeometries(
			nodeIds,
			axis,
			step,
			this.direction,
			this.groups,
			this.groupByNode,
		);

		applyArcEdges(graph, this.direction);
	}

	getGroupGeometries(): ArcGroupGeometry[] {
		return this.groupGeometries.map((geometry) => ({ ...geometry }));
	}
}

export function getArcLabelPlacement(
	direction: ArcDirection,
	angle: ArcLabelAngle,
): { rotation?: number; direction?: 1 | -1 } {
	const degrees =
		angle === 'auto'
			? direction === 'up' || direction === 'down'
				? 90
				: 0
			: angle;
	if (degrees === 0) {
		return {};
	}

	const rotation = (degrees * Math.PI) / 180;
	return {
		rotation:
			direction === 'left' || direction === 'up' ? rotation : -rotation,
		direction: direction === 'right' ? -1 : 1,
	};
}

function calculateArcStep(
	graph: RuntimeGraph,
	nodeIds: string[],
	spacing: number,
): number {
	const largestNodeSize = Math.max(
		7,
		...nodeIds.map((nodeId) => graph.getNodeAttribute(nodeId, 'size')),
	);
	return Math.max(72, largestNodeSize * 10) * spacing;
}

export function applyArcEdges(
	graph: RuntimeGraph,
	direction: ArcDirection = 'right',
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
		const verticalArc = isVerticalArc(direction);
		const points = createArcPoints(
			verticalArc ? sourceAttributes.y : sourceAttributes.x,
			verticalArc ? targetAttributes.y : targetAttributes.x,
			verticalArc ? sourceAttributes.x : sourceAttributes.y,
			direction,
			getParallelLane(attributes) *
				getArcParallelGap(
					Math.abs(
						(verticalArc
							? targetAttributes.y
							: targetAttributes.x) -
							(verticalArc
								? sourceAttributes.y
								: sourceAttributes.x),
					),
				),
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
			parallelRouteOwner: 'layout' as const,
		};
		const pathNodes = [source];
		for (const [index, point] of points.slice(1, -1).entries()) {
			const bendNode = `__arc-bend__${edge}__${index + 1}`;
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
			const segmentKey = `${edge}__arc_segment_${index + 1}`;
			const styledSegment = {
				...segmentAttributes,
				type: getEdgeType(
					attributes.lineStyle,
					directed && lastSegment,
					attributes.arrowStyle,
				),
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

export function createArcPoints(
	sourceAxis: number,
	targetAxis: number,
	offset = 0,
	direction: ArcDirection = 'right',
	radiusOffset = 0,
): ArcPoint[] {
	const distance = Math.abs(targetAxis - sourceAxis);
	if (distance < 0.001) {
		return [];
	}

	const radius = Math.max(distance / 2 + radiusOffset, distance * 0.12);
	const samples = Math.max(8, Math.min(48, Math.ceil(distance / 16)));
	const verticalArc = isVerticalArc(direction);
	const sign = direction === 'left' || direction === 'down' ? -1 : 1;

	return Array.from({ length: samples + 1 }, (_, index) => {
		const t = index / samples;
		const axis = sourceAxis + (targetAxis - sourceAxis) * t;
		const bulge = Math.sin(Math.PI * t) * radius * sign;
		return verticalArc
			? { x: offset + bulge, y: axis }
			: { x: axis, y: offset + bulge };
	});
}

function getArcParallelGap(distance: number): number {
	return Math.max(8, Math.min(24, distance * 0.12));
}

function isVerticalArc(direction: ArcDirection): boolean {
	return direction === 'right' || direction === 'left';
}

function sortArcNodeIds(
	graph: RuntimeGraph,
	nodeSort: LayoutNodeSort,
	nodeSortDirection: LayoutSortDirection,
	groups: readonly ChartGroupDefinition[] = [],
	groupByNode: ReadonlyMap<string, string> = new Map(),
): string[] {
	const groupOrder = new Map(
		groups.map((group, index) => [group.id, index] as const),
	);
	const ungroupedOrder = groups.length;
	const nodeIds = graph
		.nodes()
		.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'))
		.sort(compareLayoutNodeIds(graph, nodeSort, nodeSortDirection));
	const sortedIndex = new Map(
		nodeIds.map((nodeId, index) => [nodeId, index] as const),
	);
	return nodeIds.sort((left, right) => {
		const leftOrder =
			groupOrder.get(groupByNode.get(left) ?? '') ?? ungroupedOrder;
		const rightOrder =
			groupOrder.get(groupByNode.get(right) ?? '') ?? ungroupedOrder;
		return (
			leftOrder - rightOrder ||
			(sortedIndex.get(left) ?? 0) - (sortedIndex.get(right) ?? 0)
		);
	});
}

function createArcGroupGeometries(
	nodeIds: readonly string[],
	axis: ReturnType<typeof scalePoint<string>>,
	step: number,
	direction: ArcDirection,
	groups: readonly ChartGroupDefinition[],
	groupByNode: ReadonlyMap<string, string>,
): ArcGroupGeometry[] {
	const positionsByGroup = new Map<string, number[]>();
	for (const nodeId of nodeIds) {
		const groupId = groupByNode.get(nodeId);
		const position = axis(nodeId);
		if (!groupId || position === undefined) {
			continue;
		}
		const positions = positionsByGroup.get(groupId) ?? [];
		positions.push(position);
		positionsByGroup.set(groupId, positions);
	}
	return groups.flatMap((group) => {
		const positions = positionsByGroup.get(group.id);
		if (!positions?.length) {
			return [];
		}
		const padding = scaleLayoutGroupPadding(group.padding);
		const axisPadding = step * (0.08 + padding * 0.75);
		return [
			{
				kind: 'arc-band' as const,
				groupId: group.id,
				name: group.name,
				color: group.color,
				direction,
				start: Math.min(...positions) - axisPadding,
				end: Math.max(...positions) + axisPadding,
				halfWidth: step * (0.18 + padding * 0.5),
			},
		];
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
