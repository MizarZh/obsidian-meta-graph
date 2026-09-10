import type {
	EdgeId,
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	NodeId,
	RelationType,
} from '@/core/types';

interface EdgeOrder {
	next: number;
	positions: Map<EdgeId, number>;
}

const edgeOrders = new WeakMap<KnowledgeIndex, EdgeOrder>();

export function createKnowledgeIndex(): KnowledgeIndex {
	const index: KnowledgeIndex = {
		nodes: new Map(),
		edges: new Map(),
		outgoing: new Map(),
		incoming: new Map(),
	};
	edgeOrders.set(index, { next: 0, positions: new Map() });
	return index;
}

export function normalizePath(path: string): string {
	return path.replaceAll('\\', '/').replace(/^\/+/, '');
}

export function createEdgeId(
	source: NodeId,
	relation: RelationType,
	target: NodeId,
	directed: boolean,
): EdgeId {
	if (!directed && target.localeCompare(source) < 0) {
		return JSON.stringify([target, relation, source]);
	}
	return JSON.stringify([source, relation, target]);
}

export function addNode(index: KnowledgeIndex, node: KnowledgeNode): void {
	index.nodes.set(node.id, node);
	ensureAdjacency(index, node.id);
}

export function addEdge(index: KnowledgeIndex, edge: KnowledgeEdge): void {
	if (index.edges.has(edge.id)) {
		return;
	}
	const order = getEdgeOrder(index);
	order.positions.set(edge.id, order.next++);
	index.edges.set(edge.id, edge);
	ensureAdjacency(index, edge.source);
	ensureAdjacency(index, edge.target);
	index.outgoing.get(edge.source)?.add(edge.id);
	index.incoming.get(edge.target)?.add(edge.id);
}

export function removeEdge(index: KnowledgeIndex, edgeId: EdgeId): void {
	const edge = index.edges.get(edgeId);
	if (!edge) return;
	edgeOrders.get(index)?.positions.delete(edgeId);
	index.edges.delete(edgeId);
	index.outgoing.get(edge.source)?.delete(edgeId);
	index.incoming.get(edge.target)?.delete(edgeId);
}

/** Only source adjacency is needed when every result must start in nodeIds. */
export function getOutgoingEdgesInIndexOrder(
	index: KnowledgeIndex,
	nodeIds: ReadonlySet<NodeId>,
): KnowledgeEdge[] {
	const edges: KnowledgeEdge[] = [];
	for (const nodeId of nodeIds) {
		for (const edgeId of index.outgoing.get(nodeId) ?? []) {
			const edge = index.edges.get(edgeId);
			if (edge) edges.push(edge);
		}
	}
	if (edges.length < 2) return edges;
	const order = getEdgeOrder(index);
	return edges.sort(
		(left, right) =>
			(order.positions.get(left.id) ?? 0) -
			(order.positions.get(right.id) ?? 0),
	);
}

function getEdgeOrder(index: KnowledgeIndex): EdgeOrder {
	let order = edgeOrders.get(index);
	if (!order) {
		// Compatibility for indexes constructed without createKnowledgeIndex.
		order = { next: 0, positions: new Map() };
		for (const edgeId of index.edges.keys()) {
			order.positions.set(edgeId, order.next++);
		}
		edgeOrders.set(index, order);
	}
	return order;
}

export function removeNode(index: KnowledgeIndex, nodeId: NodeId): void {
	for (const edgeId of new Set([
		...(index.outgoing.get(nodeId) ?? []),
		...(index.incoming.get(nodeId) ?? []),
	])) {
		removeEdge(index, edgeId);
	}
	index.nodes.delete(nodeId);
	index.outgoing.delete(nodeId);
	index.incoming.delete(nodeId);
}

function ensureAdjacency(index: KnowledgeIndex, nodeId: NodeId): void {
	if (!index.outgoing.has(nodeId)) {
		index.outgoing.set(nodeId, new Set());
	}
	if (!index.incoming.has(nodeId)) {
		index.incoming.set(nodeId, new Set());
	}
}
