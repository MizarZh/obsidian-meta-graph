import Graph from 'graphology';
import type {
	GraphProjection,
	KnowledgeEdgeKind,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
	RelationType,
	DefaultLinkStyle,
	DefaultNodeStyle,
} from '../../core/types';
import type { GraphPalette } from '../styles/graph-styles';
import {
	resolveLinkStyle,
	resolveNodeStyle,
	type NodeStyleContext,
} from '../styles/style-rules';

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
	createdTime?: number;
	modifiedTime?: number;
	domains: string[];
	tags: string[];
	noteType?: string;
	isPrimary?: boolean;
	isContext?: boolean;
	hidden?: boolean;
	fixed?: boolean;
	isBend?: boolean;
	labelRotation?: number;
	labelDirection?: 1 | -1;
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
	kind?: KnowledgeEdgeKind;
	semantic?: boolean;
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
	private readonly defaultNodeStyle: Required<DefaultNodeStyle>;
	private readonly defaultLinkStyle: Required<DefaultLinkStyle>;
	private readonly nodeStyleRules: NodeStyleRule[];
	private readonly linkStyleRules: LinkStyleRule[];

	constructor(
		private readonly palette: GraphPalette,
		defaultNodeStyleOrRules:
			Required<DefaultNodeStyle> | NodeStyleRule[] = [],
		defaultLinkStyleOrRules:
			Required<DefaultLinkStyle> | LinkStyleRule[] = [],
		nodeStyleRules: NodeStyleRule[] = [],
		linkStyleRules: LinkStyleRule[] = [],
		private readonly nodeStyleContexts: ReadonlyMap<
			string,
			NodeStyleContext
		> = new Map(),
		private readonly plainLinkStyle: Required<DefaultLinkStyle> = {
			color: palette.mutedEdge,
			size: 1,
			lineStyle: 'dashed',
			label: '',
			showLabel: false,
			hidden: false,
		},
	) {
		const legacySignature = Array.isArray(defaultNodeStyleOrRules);
		this.defaultNodeStyle = legacySignature
			? { color: palette.node, size: 7 }
			: defaultNodeStyleOrRules;
		this.defaultLinkStyle = Array.isArray(defaultLinkStyleOrRules)
			? {
					color: palette.edge,
					size: 1.5,
					lineStyle: 'solid',
					label: '',
					showLabel: false,
					hidden: false,
				}
			: defaultLinkStyleOrRules;
		this.nodeStyleRules = legacySignature
			? defaultNodeStyleOrRules
			: nodeStyleRules;
		this.linkStyleRules = Array.isArray(defaultLinkStyleOrRules)
			? defaultLinkStyleOrRules
			: linkStyleRules;
	}

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
			const isPrimary = projection.primaryIds?.has(node.id) ?? false;
			const isContext = projection.contextIds?.has(node.id) ?? false;
			const hidden = projection.hiddenNodeIds?.has(node.id) ?? false;
			const style = resolveNodeStyle(
				node,
				this.nodeStyleRules,
				{
					color: this.defaultNodeStyle.color || this.palette.node,
					size: this.defaultNodeStyle.size,
				},
				this.nodeStyleContexts.get(node.id),
			);
			const position =
				positions.get(node.id) ??
				createInitialPosition(node.id, projection, positions);
			graph.addNode(node.id, {
				label: node.title,
				x: position.x,
				y: position.y,
				size: isPrimary ? style.size * 1.2 : style.size,
					color: style.color,
					path: node.path,
					folder: node.folder,
					createdTime: node.createdTime,
					modifiedTime: node.modifiedTime,
					domains: node.domains,
				tags: node.tags,
				noteType: node.noteType,
				isPrimary,
				isContext,
				hidden,
				fixed: positions.has(node.id),
			});
		}

		for (const edge of projection.edges) {
			const style = resolveLinkStyle(edge, this.linkStyleRules, {
				color: this.defaultLinkStyle.color || this.palette.edge,
				size: this.defaultLinkStyle.size,
				lineStyle: this.defaultLinkStyle.lineStyle,
				label: this.defaultLinkStyle.showLabel
					? this.defaultLinkStyle.label || edge.relation
					: '',
				hidden: this.defaultLinkStyle.hidden,
			});
			const resolvedStyle = isPlainLinkEdge(edge)
				? {
						...style,
						color: this.plainLinkStyle.color,
						size: this.plainLinkStyle.size,
						lineStyle: this.plainLinkStyle.lineStyle,
						hidden: this.plainLinkStyle.hidden,
						label: '',
					}
				: style;
			const attributes: RuntimeEdgeAttributes = {
				relation: edge.relation,
				type: getEdgeType(resolvedStyle.lineStyle, edge.directed),
				size: resolvedStyle.size,
				color: resolvedStyle.color,
				label: resolvedStyle.label,
				forceLabel: Boolean(resolvedStyle.label),
				lineStyle: resolvedStyle.lineStyle,
				kind: edge.kind,
				semantic: edge.semantic ?? edge.kind !== 'plain-link',
				hidden:
					resolvedStyle.hidden ||
					Boolean(projection.hiddenNodeIds?.has(edge.source)) ||
					Boolean(projection.hiddenNodeIds?.has(edge.target)),
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

function isPlainLinkEdge(edge: {
	kind?: KnowledgeEdgeKind;
	semantic?: boolean;
}): boolean {
	return edge.kind === 'plain-link' || edge.semantic === false;
}

export function getEdgeType(
	lineStyle: LinkLineStyle,
	directed: boolean,
): string {
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
	const neighborId = connectedIds.find((candidate) =>
		positions.has(candidate),
	);
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
		.map(([, position]) =>
			Math.atan2(position.y - anchor.y, position.x - anchor.x),
		)
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
