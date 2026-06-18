import Graph from 'graphology';
import type {
	GraphProjection,
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
				label: '',
				hidden: false,
			});
			const attributes: RuntimeEdgeAttributes = {
				relation: edge.relation,
				type: edge.directed ? 'arrow' : 'line',
				size: style.size,
				color: style.color,
				label: style.label,
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

function createInitialPosition(
	nodeId: string,
	projection: GraphProjection,
	positions: ReadonlyMap<string, GraphPosition>,
): GraphPosition {
	const neighborId = projection.edges
		.filter((edge) => edge.source === nodeId || edge.target === nodeId)
		.map((edge) => (edge.source === nodeId ? edge.target : edge.source))
		.find((candidate) => positions.has(candidate));
	const anchor = neighborId ? positions.get(neighborId) : undefined;
	const angle = hashString(nodeId) * Math.PI * 2;
	const radius = anchor ? 0.15 : 1;
	return {
		x: (anchor?.x ?? 0) + Math.cos(angle) * radius,
		y: (anchor?.y ?? 0) + Math.sin(angle) * radius,
	};
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}
