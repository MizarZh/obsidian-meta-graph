import type { GraphProjection, GraphTraceRequest } from '@/core/types';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { traceGraph, type GraphTraceResult } from '@/query/trace';

export function traceVisibleGraph(
	graph: RuntimeGraph,
	projection: GraphProjection,
	request: GraphTraceRequest,
): GraphTraceResult {
	const visibleEdges = new Set<string>();
	graph.forEachEdge((id, edge) => {
		if (!edge.hidden && (edge.opacity ?? 1) > 0)
			visibleEdges.add(edge.logicalEdgeId ?? id);
	});
	return traceGraph(
		{
			...projection,
			nodes: projection.nodes.filter((node) => {
				if (!graph.hasNode(node.id)) return false;
				const attrs = graph.getNodeAttributes(node.id);
				return !attrs.hidden && (attrs.opacity ?? 1) > 0;
			}),
			edges: projection.edges.filter((edge) => visibleEdges.has(edge.id)),
		},
		request,
	);
}

/** Apply only after canonical styles have been restored, so fading never accumulates. */
export function applyGraphTrace(
	graph: RuntimeGraph,
	projection: GraphProjection,
	request: GraphTraceRequest | undefined,
	color: string,
): void {
	if (!request || (request.mode === 'path' && !request.target)) return;
	const result = traceVisibleGraph(graph, projection, request);
	if (!result.found) return;
	graph.forEachNode((id, node) => {
		if (node.isBend || node.hidden) return;
		if (result.nodeIds.has(id)) node.color = color;
		else node.opacity = (node.opacity ?? 1) * 0.18;
	});
	graph.forEachEdge((id, edge) => {
		if (edge.hidden) return;
		if (result.edgeIds.has(edge.logicalEdgeId ?? id)) edge.color = color;
		else edge.opacity = (edge.opacity ?? 1) * 0.18;
	});
}
