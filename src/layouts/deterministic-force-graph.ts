import type { RuntimeGraph } from '@/graph/model/graphology-adapter';

/** ID-based seeds do not shift existing seeds when a note is inserted. */
function coordinate(key: string): number {
	let hash = 2166136261;
	for (let i = 0; i < key.length; i++)
		hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
	hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
	hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
	return (((hash ^ (hash >>> 16)) >>> 0) / 0x100000000 - 0.5) * 20;
}

/** Sort the simulation input, preserving the real graph's data and ordering. */
export function createDeterministicForceGraph(
	graph: RuntimeGraph,
): RuntimeGraph {
	const working = graph.nullCopy();
	for (const id of graph.nodes().sort()) {
		working.addNode(id, {
			...graph.getNodeAttributes(id),
			x: coordinate(`x:${id}`),
			y: coordinate(`y:${id}`),
			fixed: false,
		});
	}
	for (const id of graph.edges().sort()) {
		const add = graph.isUndirected(id)
			? working.addUndirectedEdgeWithKey.bind(working)
			: working.addDirectedEdgeWithKey.bind(working);
		add(id, graph.source(id), graph.target(id), {
			...graph.getEdgeAttributes(id),
		});
	}
	return working;
}
