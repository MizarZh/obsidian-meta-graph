import type {
	GraphProjection,
	KnowledgeEdge,
	KnowledgeNode,
	WorkspaceState,
} from '../../core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
} from '../../graph/styles/active-styles';
import {
	GraphologyAdapter,
	getEdgeType,
	type GraphPosition,
	type RuntimeGraph,
} from '../../graph/model/graphology-adapter';
import type { GraphPalette } from '../../graph/styles/graph-styles';
import {
	resolveLinkStyle,
	resolveNodeStyle,
} from '../../graph/styles/style-rules';

export function createWorkspaceRuntimeGraph(
	projection: GraphProjection,
	positions: ReadonlyMap<string, GraphPosition>,
	state: WorkspaceState,
	palette: GraphPalette,
): RuntimeGraph {
	return new GraphologyAdapter(
		palette,
		getActiveDefaultNodeStyle(state, palette.node),
		getActiveDefaultLinkStyle(state, palette.edge),
		getActiveNodeStyleRules(state),
		getActiveLinkStyleRules(state),
	).fromProjection(projection, positions);
}

export function syncWorkspaceRuntimeGraphStyles(
	graph: RuntimeGraph,
	projection: GraphProjection,
	state: WorkspaceState,
	palette: GraphPalette,
): void {
	const defaultNodeStyle = getActiveDefaultNodeStyle(state, palette.node);
	const defaultLinkStyle = getActiveDefaultLinkStyle(state, palette.edge);
	const nodeRules = getActiveNodeStyleRules(state);
	const linkRules = getActiveLinkStyleRules(state);

	for (const node of projection.nodes) {
		if (!graph.hasNode(node.id)) {
			continue;
		}
		const style = resolveRuntimeNodeStyle(
			node,
			projection,
			nodeRules,
			defaultNodeStyle,
			palette,
		);
		graph.mergeNodeAttributes(node.id, style);
	}

	const segmentsByLogicalEdge = new Map<string, string[]>();
	graph.forEachEdge((runtimeEdgeId, attributes) => {
		if (!attributes.logicalEdgeId) {
			return;
		}
		const segments =
			segmentsByLogicalEdge.get(attributes.logicalEdgeId) ?? [];
		segments.push(runtimeEdgeId);
		segmentsByLogicalEdge.set(attributes.logicalEdgeId, segments);
	});

	for (const edge of projection.edges) {
		const style = resolveRuntimeLinkStyle(
			edge,
			linkRules,
			defaultLinkStyle,
			palette,
		);
		if (graph.hasEdge(edge.id)) {
			graph.mergeEdgeAttributes(edge.id, {
				...style,
				type: getEdgeType(style.lineStyle, edge.directed),
			});
		}
		const segments = (segmentsByLogicalEdge.get(edge.id) ?? []).sort(
			(first, second) => getSegmentIndex(first) - getSegmentIndex(second),
		);
		const labelSegment = Math.floor((segments.length - 1) / 2);
		for (const [index, runtimeEdgeId] of segments.entries()) {
			const attributes = graph.getEdgeAttributes(runtimeEdgeId);
			const target = graph.target(runtimeEdgeId);
			const isLastSegment = target === attributes.logicalTarget;
			const type =
				edge.directed && isLastSegment
					? getEdgeType(style.lineStyle, true)
					: getEdgeType(style.lineStyle, false);
			graph.mergeEdgeAttributes(runtimeEdgeId, {
				...style,
				type,
				label: index === labelSegment ? style.label : '',
				forceLabel: index === labelSegment && Boolean(style.label),
			});
		}
	}
}

function getSegmentIndex(edgeId: string): number {
	return Number(edgeId.match(/__segment_(\d+)$/u)?.[1] ?? 0);
}

function resolveRuntimeNodeStyle(
	node: KnowledgeNode,
	projection: GraphProjection,
	nodeRules: ReturnType<typeof getActiveNodeStyleRules>,
	defaultNodeStyle: ReturnType<typeof getActiveDefaultNodeStyle>,
	palette: GraphPalette,
): { color: string; size: number } {
	const isPrimary = projection.primaryIds?.has(node.id) ?? false;
	const style = resolveNodeStyle(node, nodeRules, {
		color: defaultNodeStyle.color || palette.node,
		size: defaultNodeStyle.size,
	});
	return {
		color: style.color,
		size: isPrimary ? style.size * 1.2 : style.size,
	};
}

function resolveRuntimeLinkStyle(
	edge: KnowledgeEdge,
	linkRules: ReturnType<typeof getActiveLinkStyleRules>,
	defaultLinkStyle: ReturnType<typeof getActiveDefaultLinkStyle>,
	palette: GraphPalette,
): {
	color: string;
	size: number;
	hidden: boolean;
	label: string;
	forceLabel: boolean;
	lineStyle: ReturnType<typeof resolveLinkStyle>['lineStyle'];
} {
	const style = resolveLinkStyle(edge, linkRules, {
		color: defaultLinkStyle.color || palette.edge,
		size: defaultLinkStyle.size,
		lineStyle: defaultLinkStyle.lineStyle,
		label: defaultLinkStyle.showLabel
			? defaultLinkStyle.label || edge.relation
			: '',
		hidden: defaultLinkStyle.hidden,
	});
	return {
		color: style.color,
		size: style.size,
		hidden: style.hidden,
		label: style.label,
		forceLabel: Boolean(style.label),
		lineStyle: style.lineStyle,
	};
}
