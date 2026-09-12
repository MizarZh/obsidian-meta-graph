import type { GraphProjection, GraphTraceRequest } from '@/core/types';

export interface GraphTraceResult {
	nodeIds: Set<string>;
	edgeIds: Set<string>;
	found: boolean;
}

/** Linear-time traversal; visited nodes prevent cycles from repeating work. */
export function traceGraph(
	projection: GraphProjection,
	request: GraphTraceRequest,
): GraphTraceResult {
	const nodes = new Set(
		projection.nodes
			.filter((node) => !projection.hiddenNodeIds?.has(node.id))
			.map((node) => node.id),
	);
	const result: GraphTraceResult = {
		nodeIds: new Set(),
		edgeIds: new Set(),
		found: false,
	};
	if (!nodes.has(request.source)) return result;
	result.nodeIds.add(request.source);
	if (request.mode === 'path' && !request.target) return result;
	const adjacency = new Map<string, { node: string; edge: string }[]>();
	const add = (from: string, to: string, edge: string) => {
		const list = adjacency.get(from) ?? [];
		list.push({ node: to, edge });
		adjacency.set(from, list);
	};
	const rules = new Map(
		request.fieldRules?.map((rule) => [rule.field, rule.direction]),
	);
	for (const edge of projection.edges) {
		if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
		if (
			request.allFields !== undefined &&
			edge.kind !== undefined &&
			edge.kind !== 'relation'
		)
			continue;
		const field = edge.sourceField || edge.relation;
		if (request.allFields === false && !rules.has(field)) continue;
		const direction =
			request.allFields === false
				? rules.get(field)!
				: (request.direction ??
					(request.mode === 'upstream' ? 'incoming' : 'outgoing'));
		// Preserve old upstream/downstream requests; the panel explicitly includes undirected relationships.
		if (
			!request.direction &&
			request.allFields === undefined &&
			request.mode !== 'path' &&
			!edge.directed
		)
			continue;
		if (!edge.directed || direction !== 'incoming')
			add(edge.source, edge.target, edge.id);
		if (!edge.directed || direction !== 'outgoing')
			add(edge.target, edge.source, edge.id);
	}
	const visited = new Set([request.source]);
	const queue = [request.source];
	const depths = new Map([[request.source, 0]]);
	const maxDepth =
		request.mode === 'path' || request.maxDepth === undefined
			? Infinity
			: Math.max(0, Math.floor(request.maxDepth));
	const parents = new Map<string, { node: string; edge: string }>();
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index]!;
		if (request.mode === 'path' && current === request.target) break;
		if (depths.get(current)! >= maxDepth) continue;
		for (const next of adjacency.get(current) ?? []) {
			if (request.mode !== 'path') result.edgeIds.add(next.edge);
			if (visited.has(next.node)) continue;
			visited.add(next.node);
			depths.set(next.node, depths.get(current)! + 1);
			queue.push(next.node);
			parents.set(next.node, { node: current, edge: next.edge });
		}
	}
	if (request.mode !== 'path')
		return { nodeIds: visited, edgeIds: result.edgeIds, found: true };
	if (!request.target || !visited.has(request.target)) return result;
	result.found = true;
	let current = request.target;
	result.nodeIds.add(current);
	while (current !== request.source) {
		const parent = parents.get(current)!;
		result.edgeIds.add(parent.edge);
		result.nodeIds.add(parent.node);
		current = parent.node;
	}
	return result;
}
