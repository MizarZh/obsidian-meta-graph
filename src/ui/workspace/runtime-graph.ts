import type {
	GraphProjection,
	KnowledgeEdge,
	KnowledgeNode,
	ManualLayoutConfig,
	WorkspaceState,
} from '../../core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
	getActivePlainLinkStyle,
	getActiveUnresolvedNodeStyle,
	getActiveUnresolvedLinkStyle,
} from '../../graph/styles/active-styles';
import {
	GraphologyAdapter,
	getEdgeType,
	type GraphPosition,
	type RuntimeGraph,
} from '../../graph/model/graphology-adapter';
import type { GraphPalette } from '../../graph/styles/graph-styles';
import { resolveNodeStyleContext } from '../../graph/styles/node-style-context';
import {
	resolveLinkStyle,
	resolveNodeStyle,
	type NodeStyleContext,
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
		createNodeStyleContexts(projection, state.manualLayout),
		getActivePlainLinkStyle(state, palette.mutedEdge),
		getActiveUnresolvedNodeStyle(state, palette.mutedNode),
		getActiveUnresolvedLinkStyle(state, '#d97706'),
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
	const plainLinkStyle = getActivePlainLinkStyle(state, palette.mutedEdge);
	const unresolvedNodeStyle = getActiveUnresolvedNodeStyle(
		state,
		palette.mutedNode,
	);
	const unresolvedLinkStyle = getActiveUnresolvedLinkStyle(state, '#d97706');
	const nodeRules = getActiveNodeStyleRules(state);
	const linkRules = getActiveLinkStyleRules(state);
	const nodeStyleContexts = createNodeStyleContexts(
		projection,
		state.manualLayout,
	);

	for (const node of projection.nodes) {
		if (!graph.hasNode(node.id)) {
			continue;
		}
		const style = resolveRuntimeNodeStyle(
			node,
			projection,
			nodeRules,
			defaultNodeStyle,
			unresolvedNodeStyle,
			palette,
			nodeStyleContexts.get(node.id),
		);
		graph.mergeNodeAttributes(node.id, {
			...style,
			kind: node.kind,
			hidden: projection.hiddenNodeIds?.has(node.id) ?? false,
		});
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
				plainLinkStyle,
				unresolvedLinkStyle,
				palette,
			);
		if (graph.hasEdge(edge.id)) {
			graph.mergeEdgeAttributes(edge.id, {
				...style,
				type: getEdgeType(style.lineStyle, edge.directed),
				kind: edge.kind,
				semantic: edge.semantic ?? edge.kind !== 'plain-link',
				hidden:
					style.hidden ||
					Boolean(projection.hiddenNodeIds?.has(edge.source)) ||
					Boolean(projection.hiddenNodeIds?.has(edge.target)),
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
				hidden:
					style.hidden ||
					Boolean(projection.hiddenNodeIds?.has(edge.source)) ||
					Boolean(projection.hiddenNodeIds?.has(edge.target)),
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
	unresolvedNodeStyle: ReturnType<typeof getActiveUnresolvedNodeStyle>,
	palette: GraphPalette,
	context: NodeStyleContext | undefined,
): { color: string; size: number } {
	const isPrimary = projection.primaryIds?.has(node.id) ?? false;
	const style = resolveNodeStyle(
		node,
		nodeRules,
		{
			color: defaultNodeStyle.color || palette.node,
			size: defaultNodeStyle.size,
		},
		context,
	);
	const resolvedStyle =
		node.kind === 'unresolved' ? unresolvedNodeStyle : style;
	return {
		color: resolvedStyle.color,
		size: isPrimary ? resolvedStyle.size * 1.2 : resolvedStyle.size,
	};
}

function createNodeStyleContexts(
	projection: GraphProjection,
	manualLayout: ManualLayoutConfig,
): ReadonlyMap<string, NodeStyleContext> {
	return new Map(
		projection.nodes.map((node) => [
			node.id,
			resolveNodeStyleContext(node, manualLayout),
		]),
	);
}

function resolveRuntimeLinkStyle(
	edge: KnowledgeEdge,
	linkRules: ReturnType<typeof getActiveLinkStyleRules>,
	defaultLinkStyle: ReturnType<typeof getActiveDefaultLinkStyle>,
	plainLinkStyle: ReturnType<typeof getActivePlainLinkStyle>,
	unresolvedLinkStyle: ReturnType<typeof getActiveUnresolvedLinkStyle>,
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
	const resolvedStyle = isUnresolvedLinkEdge(edge)
		? {
				...style,
				color: unresolvedLinkStyle.color,
				size: unresolvedLinkStyle.size,
				lineStyle: unresolvedLinkStyle.lineStyle,
				hidden: unresolvedLinkStyle.hidden,
				label: '',
			}
		: isPlainLinkEdge(edge)
		? {
				...style,
				color: plainLinkStyle.color,
				size: plainLinkStyle.size,
				lineStyle: plainLinkStyle.lineStyle,
				hidden: plainLinkStyle.hidden,
				label: '',
			}
		: style;
	return {
		color: resolvedStyle.color,
		size: resolvedStyle.size,
		hidden: resolvedStyle.hidden,
		label: resolvedStyle.label,
		forceLabel: Boolean(resolvedStyle.label),
		lineStyle: resolvedStyle.lineStyle,
	};
}

function isPlainLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'plain-link' || (!edge.kind && edge.semantic === false);
}

function isUnresolvedLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'unresolved-link';
}
