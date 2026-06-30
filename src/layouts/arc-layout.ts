import { scalePoint } from 'd3-scale';
import type { ArcDirection } from '../core/types';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export interface ArcPoint {
	x: number;
	y: number;
}

export class ArcLayout implements LayoutEngine {
	constructor(
		private readonly spacing = 1,
		private readonly direction: ArcDirection = 'right',
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const nodeIds = sortArcNodeIds(graph);
		const step = calculateArcStep(graph, nodeIds, this.spacing);
		const length = Math.max(0, (nodeIds.length - 1) * step);
		const axis = scalePoint<string>()
			.domain(nodeIds)
			.range([-length / 2, length / 2]);

		for (const nodeId of nodeIds) {
			const axisPosition = axis(nodeId) ?? 0;
			graph.mergeNodeAttributes(nodeId, {
				x: isVerticalArc(this.direction) ? 0 : axisPosition,
				y: isVerticalArc(this.direction) ? axisPosition : 0,
				fixed: true,
			});
		}

		applyArcEdges(graph, this.direction);
	}
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

export function createArcPoints(
	sourceAxis: number,
	targetAxis: number,
	offset = 0,
	direction: ArcDirection = 'right',
): ArcPoint[] {
	const distance = Math.abs(targetAxis - sourceAxis);
	if (distance < 0.001) {
		return [];
	}

	const radius = distance / 2;
	const samples = Math.max(8, Math.min(48, Math.ceil(distance / 16)));
	const verticalArc = isVerticalArc(direction);
	const sign = direction === 'left' || direction === 'up' ? -1 : 1;

	return Array.from({ length: samples + 1 }, (_, index) => {
		const t = index / samples;
		const axis = sourceAxis + (targetAxis - sourceAxis) * t;
		const bulge = Math.sin(Math.PI * t) * radius * sign;
		return verticalArc
			? { x: offset + bulge, y: axis }
			: { x: axis, y: offset + bulge };
	});
}

function isVerticalArc(direction: ArcDirection): boolean {
	return direction === 'right' || direction === 'left';
}

function sortArcNodeIds(graph: RuntimeGraph): string[] {
	return graph
		.nodes()
		.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'))
		.sort((left, right) => {
			const leftAttributes = graph.getNodeAttributes(left);
			const rightAttributes = graph.getNodeAttributes(right);
			return (
				leftAttributes.label.localeCompare(rightAttributes.label) ||
				leftAttributes.path.localeCompare(rightAttributes.path) ||
				left.localeCompare(right)
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
