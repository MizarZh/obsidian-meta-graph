import ELK, {
	type ElkExtendedEdge,
	type ElkNode,
	type ElkPoint,
} from 'elkjs/lib/elk.bundled.js';
import type { FlowDirection, FlowEdgeStyle } from '../core/types';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export type OrthogonalRouteMap = Map<string, ElkPoint[]>;

export class ElkFlowLayout implements LayoutEngine {
	private readonly elk = new ELK();
	private orthogonalRoutes: OrthogonalRouteMap = new Map();

	constructor(
		private readonly edgeStyle: FlowEdgeStyle = 'orthogonal',
		private readonly direction: FlowDirection = 'LR',
		private readonly spacing = 1,
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const elkGraph: ElkNode = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': toElkDirection(this.direction),
				'elk.spacing.nodeNode': String(60 * this.spacing),
				'elk.layered.spacing.nodeNodeBetweenLayers': String(
					100 * this.spacing,
				),
				'elk.edgeRouting':
					this.edgeStyle === 'orthogonal' ? 'ORTHOGONAL' : 'POLYLINE',
			},
			children: graph.mapNodes((node) => ({
				id: node,
				width: 120,
				height: 44,
			})),
			edges: [],
		};

		graph.forEachEdge(
			(edge, attributes, source, target, sourceAttributes, targetAttributes) => {
				if (!attributes.hidden) {
					elkGraph.edges?.push({
						id: edge,
						sources: [source],
						targets: [target],
					});
				}
				void sourceAttributes;
				void targetAttributes;
			},
		);

		const result = await this.elk.layout(elkGraph);
		for (const node of result.children ?? []) {
			if (graph.hasNode(node.id)) {
				graph.mergeNodeAttributes(node.id, {
					x: (node.x ?? 0) + (node.width ?? 0) / 2,
					y: (node.y ?? 0) + (node.height ?? 0) / 2,
				});
			}
		}
		if (this.edgeStyle === 'orthogonal') {
			this.orthogonalRoutes = extractElkOrthogonalRoutes(result.edges ?? []);
			applyOrthogonalFlowEdges(graph, this.orthogonalRoutes);
		}
	}

	getOrthogonalRoutes(): OrthogonalRouteMap {
		return cloneOrthogonalRoutes(this.orthogonalRoutes);
	}
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
			edge.sections?.flatMap((section) => [
				section.startPoint,
				...(section.bendPoints ?? []),
				section.endPoint,
			]) ?? [],
		]),
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
			type: attributes.lineStyle === 'solid' ? 'line' : attributes.lineStyle,
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
				forceLabel:
					index === labelSegment && Boolean(attributes.label),
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
