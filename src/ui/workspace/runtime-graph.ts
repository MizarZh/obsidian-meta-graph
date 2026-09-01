import type {
	GraphProjection,
	ChartGroupingConfig,
	KnowledgeEdge,
	KnowledgeNode,
	ManualLayoutConfig,
	WorkspaceState,
} from '../../core/types';
import {
	getActiveDefaultLinkArrowSize,
	getActiveDefaultLinkStyle,
	getActiveDefaultLinkArrowStyle,
	getActiveDefaultLinkOpacity,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
	getActivePlainLinkArrowStyle,
	getActivePlainLinkArrowSize,
	getActivePlainLinkOpacity,
	getActivePlainLinkStyle,
	getActiveUnresolvedNodeStyle,
	getActiveUnresolvedLinkArrowStyle,
	getActiveUnresolvedLinkArrowSize,
	getActiveUnresolvedLinkOpacity,
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
	resolveLinkArrowSize,
	resolveLinkArrowStyle,
	resolveLinkOpacity,
	resolveLinkStyle,
	resolveNodeStyle,
	type NodeStyleContext,
} from '../../graph/styles/style-rules';

interface RuntimeVisibilityIndex {
	edgeIdsByNode: ReadonlyMap<string, readonly string[]>;
}

export interface RuntimeVisibilityChanges {
	nodeIds: string[];
	edgeIds: string[];
}

const visibilityIndexes = new WeakMap<RuntimeGraph, RuntimeVisibilityIndex>();
type ActiveLinkStyleWithArrow = ReturnType<typeof getActiveDefaultLinkStyle> & {
	arrowStyle: ReturnType<typeof getActiveDefaultLinkArrowStyle>;
	opacity: number;
	arrowSize: number;
};

export function createWorkspaceRuntimeGraph(
	projection: GraphProjection,
	positions: ReadonlyMap<string, GraphPosition>,
	state: WorkspaceState,
	palette: GraphPalette,
): RuntimeGraph {
	return new GraphologyAdapter(
		palette,
		getActiveDefaultNodeStyle(state, palette.node),
		{
			...getActiveDefaultLinkStyle(state, palette.edge),
			arrowStyle: getActiveDefaultLinkArrowStyle(state),
			opacity: getActiveDefaultLinkOpacity(state),
			arrowSize: getActiveDefaultLinkArrowSize(state),
		},
		getActiveNodeStyleRules(state),
		getActiveLinkStyleRules(state),
		createNodeStyleContexts(projection, state.grouping, state.manualLayout),
		{
			...getActivePlainLinkStyle(state, palette.mutedEdge),
			arrowStyle: getActivePlainLinkArrowStyle(state),
			opacity: getActivePlainLinkOpacity(state),
			arrowSize: getActivePlainLinkArrowSize(state),
		},
		getActiveUnresolvedNodeStyle(state, palette.mutedNode),
		{
			...getActiveUnresolvedLinkStyle(state, '#d97706'),
			arrowStyle: getActiveUnresolvedLinkArrowStyle(state),
			opacity: getActiveUnresolvedLinkOpacity(state),
			arrowSize: getActiveUnresolvedLinkArrowSize(state),
		},
	).fromProjection(projection, positions);
}

export function syncWorkspaceRuntimeGraphStyles(
	graph: RuntimeGraph,
	projection: GraphProjection,
	state: WorkspaceState,
	palette: GraphPalette,
): void {
	const defaultNodeStyle = getActiveDefaultNodeStyle(state, palette.node);
	const defaultLinkStyle = {
		...getActiveDefaultLinkStyle(state, palette.edge),
		arrowStyle: getActiveDefaultLinkArrowStyle(state),
		opacity: getActiveDefaultLinkOpacity(state),
		arrowSize: getActiveDefaultLinkArrowSize(state),
	};
	const plainLinkStyle = {
		...getActivePlainLinkStyle(state, palette.mutedEdge),
		arrowStyle: getActivePlainLinkArrowStyle(state),
		opacity: getActivePlainLinkOpacity(state),
		arrowSize: getActivePlainLinkArrowSize(state),
	};
	const unresolvedNodeStyle = getActiveUnresolvedNodeStyle(
		state,
		palette.mutedNode,
	);
	const unresolvedLinkStyle = {
		...getActiveUnresolvedLinkStyle(state, '#d97706'),
		arrowStyle: getActiveUnresolvedLinkArrowStyle(state),
		opacity: getActiveUnresolvedLinkOpacity(state),
		arrowSize: getActiveUnresolvedLinkArrowSize(state),
	};
	const nodeRules = getActiveNodeStyleRules(state);
	const linkRules = getActiveLinkStyleRules(state);
	const nodeStyleContexts = createNodeStyleContexts(
		projection,
		state.grouping,
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
				styleHidden: style.hidden,
				type: getEdgeType(
					style.lineStyle,
					edge.directed,
					style.arrowStyle,
				),
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
					? getEdgeType(style.lineStyle, true, style.arrowStyle)
					: getEdgeType(style.lineStyle, false, style.arrowStyle);
			graph.mergeEdgeAttributes(runtimeEdgeId, {
				...style,
				styleHidden: style.hidden,
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

export function prepareWorkspaceRuntimeGraphVisibilityIndex(
	graph: RuntimeGraph,
): void {
	const edgeIdsByNode = new Map<string, string[]>();
	graph.forEachEdge((edgeId, attributes, source, target) => {
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
		appendEdgeId(edgeIdsByNode, logicalSource, edgeId);
		if (logicalTarget !== logicalSource) {
			appendEdgeId(edgeIdsByNode, logicalTarget, edgeId);
		}
	});
	visibilityIndexes.set(graph, { edgeIdsByNode });
}

export function syncWorkspaceRuntimeGraphVisibility(
	graph: RuntimeGraph,
	projection: GraphProjection,
	changedNodeIds?: Iterable<string>,
): RuntimeVisibilityChanges {
	const hiddenNodeIds = projection.hiddenNodeIds ?? new Set<string>();
	const nodeIds = changedNodeIds
		? [...new Set(changedNodeIds)]
		: graph.nodes();
	const changedNodes: string[] = [];
	for (const nodeId of nodeIds) {
		if (!graph.hasNode(nodeId)) {
			continue;
		}
		const attributes = graph.getNodeAttributes(nodeId);
		const hidden = hiddenNodeIds.has(nodeId);
		if (!attributes.isBend && Boolean(attributes.hidden) !== hidden) {
			// Graphology returns the live attributes object. Mutate it silently so
			// Sigma does not treat a visibility-only update as a layout change.
			attributes.hidden = hidden;
			changedNodes.push(nodeId);
		}
	}

	let index = visibilityIndexes.get(graph);
	if (!index) {
		prepareWorkspaceRuntimeGraphVisibilityIndex(graph);
		index = visibilityIndexes.get(graph);
	}
	const edgeIds = new Set<string>();
	for (const nodeId of nodeIds) {
		for (const edgeId of index?.edgeIdsByNode.get(nodeId) ?? []) {
			edgeIds.add(edgeId);
		}
	}
	const changedEdges: string[] = [];
	for (const edgeId of edgeIds) {
		if (!graph.hasEdge(edgeId)) {
			continue;
		}
		const attributes = graph.getEdgeAttributes(edgeId);
		const source = graph.source(edgeId);
		const target = graph.target(edgeId);
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
		const hidden =
			Boolean(attributes.styleHidden) ||
			hiddenNodeIds.has(logicalSource) ||
			hiddenNodeIds.has(logicalTarget);
		if (attributes.hidden !== hidden) {
			attributes.hidden = hidden;
			changedEdges.push(edgeId);
		}
	}
	return { nodeIds: changedNodes, edgeIds: changedEdges };
}

function appendEdgeId(
	edgeIdsByNode: Map<string, string[]>,
	nodeId: string,
	edgeId: string,
): void {
	const edgeIds = edgeIdsByNode.get(nodeId) ?? [];
	edgeIds.push(edgeId);
	edgeIdsByNode.set(nodeId, edgeIds);
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
): {
	color: string;
	size: number;
	opacity: number;
	type: NonNullable<ReturnType<typeof resolveNodeStyle>['shape']>;
} {
	const isPrimary = projection.primaryIds?.has(node.id) ?? false;
	const style = resolveNodeStyle(
		node,
		nodeRules,
		{
			color: defaultNodeStyle.color || palette.node,
			size: defaultNodeStyle.size,
			opacity: defaultNodeStyle.opacity,
			shape: defaultNodeStyle.shape,
		},
		context,
	);
	const resolvedStyle =
		node.kind === 'unresolved' ? unresolvedNodeStyle : style;
	return {
		color: resolvedStyle.color,
		size: isPrimary ? resolvedStyle.size * 1.2 : resolvedStyle.size,
		opacity: resolvedStyle.opacity,
		type: resolvedStyle.shape,
	};
}

function createNodeStyleContexts(
	projection: GraphProjection,
	grouping: ChartGroupingConfig,
	manualLayout: ManualLayoutConfig,
): ReadonlyMap<string, NodeStyleContext> {
	return new Map(
		projection.nodes.map((node) => [
			node.id,
			resolveNodeStyleContext(node, grouping, manualLayout),
		]),
	);
}

function resolveRuntimeLinkStyle(
	edge: KnowledgeEdge,
	linkRules: ReturnType<typeof getActiveLinkStyleRules>,
	defaultLinkStyle: ActiveLinkStyleWithArrow,
	plainLinkStyle: ActiveLinkStyleWithArrow,
	unresolvedLinkStyle: ActiveLinkStyleWithArrow,
	palette: GraphPalette,
): {
	color: string;
	size: number;
	hidden: boolean;
	label: string;
	forceLabel: boolean;
	lineStyle: ReturnType<typeof resolveLinkStyle>['lineStyle'];
	arrowStyle: 'filled' | 'chevron';
	opacity: number;
	arrowSize: number;
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
	const arrowStyle = resolveLinkArrowStyle(
		edge,
		linkRules,
		defaultLinkStyle.arrowStyle,
	);
	const resolvedArrowStyle = isUnresolvedLinkEdge(edge)
		? unresolvedLinkStyle.arrowStyle
		: isPlainLinkEdge(edge)
			? plainLinkStyle.arrowStyle
			: arrowStyle;
	const opacity = resolveLinkOpacity(
		edge,
		linkRules,
		defaultLinkStyle.opacity,
	);
	const arrowSize = resolveLinkArrowSize(
		edge,
		linkRules,
		defaultLinkStyle.arrowSize,
	);
	const resolvedOpacity = isUnresolvedLinkEdge(edge)
		? unresolvedLinkStyle.opacity
		: isPlainLinkEdge(edge)
			? plainLinkStyle.opacity
			: opacity;
	const resolvedArrowSize = isUnresolvedLinkEdge(edge)
		? unresolvedLinkStyle.arrowSize
		: isPlainLinkEdge(edge)
			? plainLinkStyle.arrowSize
			: arrowSize;
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
		arrowStyle: resolvedArrowStyle,
		opacity: resolvedOpacity,
		arrowSize: resolvedArrowSize,
	};
}

function isPlainLinkEdge(edge: KnowledgeEdge): boolean {
	return (
		edge.kind === 'plain-link' || (!edge.kind && edge.semantic === false)
	);
}

function isUnresolvedLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'unresolved-link';
}
