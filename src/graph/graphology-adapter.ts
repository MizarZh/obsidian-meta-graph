import Graph from 'graphology';
import type {
	GraphProjection,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
	RelationType,
} from '../core/types';
import type { GraphPalette } from './graph-styles';
import { resolveLinkStyle, resolveNodeStyle } from './style-rules';

export interface GraphPosition {
	x: number;
	y: number;
}

export interface RuntimeNodeAttributes {
	label: string;
	x: number;
	y: number;
	size: number;
	color: string;
	path: string;
	folder: string;
	domains: string[];
	tags: string[];
	noteType?: string;
	fixed?: boolean;
	isBend?: boolean;
}

export interface RuntimeEdgeAttributes {
	relation: RelationType;
	type: string;
	size: number;
	color: string;
	hidden: boolean;
	label: string;
	forceLabel: boolean;
	lineStyle: LinkLineStyle;
	logicalEdgeId?: string;
	logicalSource?: string;
	logicalTarget?: string;
}

export type RuntimeGraph = Graph<
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes,
	Record<string, never>
>;

export class GraphologyAdapter {
	constructor(
		private readonly palette: GraphPalette,
		private readonly nodeStyleRules: NodeStyleRule[] = [],
		private readonly linkStyleRules: LinkStyleRule[] = [],
	) {}

	fromProjection(
		projection: GraphProjection,
		positions: ReadonlyMap<string, GraphPosition> = new Map(),
	): RuntimeGraph {
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });

		for (const node of projection.nodes) {
			const style = resolveNodeStyle(node, this.nodeStyleRules, {
				color: this.palette.node,
				size: 7,
			});
			const position =
				positions.get(node.id) ??
				createInitialPosition(node.id, projection, positions);
			graph.addNode(node.id, {
				label: node.title,
				x: position.x,
				y: position.y,
				size: style.size,
				color: style.color,
				path: node.path,
				folder: node.folder,
				domains: node.domains,
				tags: node.tags,
				noteType: node.noteType,
				fixed: positions.has(node.id),
			});
		}

		for (const edge of projection.edges) {
			const style = resolveLinkStyle(edge, this.linkStyleRules, {
				color: this.palette.edge,
				size: edge.directed ? 1.5 : 1,
				lineStyle: 'solid',
				label: '',
				hidden: false,
			});
			const attributes: RuntimeEdgeAttributes = {
				relation: edge.relation,
				type: getEdgeType(style.lineStyle, edge.directed),
				size: style.size,
				color: style.color,
				label: style.label,
				forceLabel: Boolean(style.label),
				lineStyle: style.lineStyle,
				hidden: style.hidden,
			};
			if (edge.directed) {
				graph.addDirectedEdgeWithKey(
					edge.id,
					edge.source,
					edge.target,
					attributes,
				);
			} else {
				graph.addUndirectedEdgeWithKey(
					edge.id,
					edge.source,
					edge.target,
					attributes,
				);
			}
		}

		return graph;
	}
}

export function getEdgeType(lineStyle: LinkLineStyle, directed: boolean): string {
	if (lineStyle === 'solid') {
		return directed ? 'arrow' : 'line';
	}
	return directed ? `${lineStyle}-arrow` : lineStyle;
}

function createInitialPosition(
	nodeId: string,
	projection: GraphProjection,
	positions: ReadonlyMap<string, GraphPosition>,
): GraphPosition {
	const connectedIds = projection.edges
		.filter((edge) => edge.source === nodeId || edge.target === nodeId)
		.map((edge) => (edge.source === nodeId ? edge.target : edge.source));
	const neighborId = connectedIds.find((candidate) => positions.has(candidate));
	const anchor = neighborId ? positions.get(neighborId) : undefined;
	if (!neighborId || !anchor) {
		const angle = hashString(nodeId) * Math.PI * 2;
		return {
			x: Math.cos(angle),
			y: Math.sin(angle),
		};
	}
	const angle = findOpenAngle(nodeId, neighborId, positions);
	const radius =
		estimateNeighborRadius(neighborId, projection) +
		estimateNodeRadius(nodeId, projection) +
		0.8;
	return {
		x: anchor.x + Math.cos(angle) * radius,
		y: anchor.y + Math.sin(angle) * radius,
	};
}

function findOpenAngle(
	nodeId: string,
	anchorId: string,
	positions: ReadonlyMap<string, GraphPosition>,
): number {
	const anchor = positions.get(anchorId);
	if (!anchor) {
		return hashString(nodeId) * Math.PI * 2;
	}
	const occupiedAngles = [...positions.entries()]
		.filter(([positionedNodeId]) => positionedNodeId !== anchorId)
		.map(([, position]) => Math.atan2(position.y - anchor.y, position.x - anchor.x))
		.sort((left, right) => left - right);
	if (occupiedAngles.length === 0) {
		return hashString(nodeId) * Math.PI * 2;
	}

	let bestAngle = occupiedAngles[0] ?? 0;
	let bestGap = -1;
	for (let index = 0; index < occupiedAngles.length; index += 1) {
		const current = occupiedAngles[index] ?? 0;
		const next =
			index === occupiedAngles.length - 1
				? (occupiedAngles[0] ?? 0) + Math.PI * 2
				: (occupiedAngles[index + 1] ?? 0);
		const gap = next - current;
		if (gap > bestGap) {
			bestGap = gap;
			bestAngle = current + gap / 2;
		}
	}
	return bestAngle;
}

function estimateNeighborRadius(
	nodeId: string,
	projection: GraphProjection,
): number {
	const edgeCount = projection.edges.filter(
		(edge) => edge.source === nodeId || edge.target === nodeId,
	).length;
	return 0.35 + Math.min(0.7, edgeCount * 0.08);
}

function estimateNodeRadius(
	nodeId: string,
	projection: GraphProjection,
): number {
	const node = projection.nodes.find((item) => item.id === nodeId);
	const titleLength = node?.title.length ?? 8;
	return 0.35 + Math.min(0.45, titleLength * 0.015);
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}
