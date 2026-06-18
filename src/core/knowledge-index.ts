import type {
	EdgeId,
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	NodeId,
	RelationType,
} from './types';

export function createKnowledgeIndex(): KnowledgeIndex {
	return {
		nodes: new Map(),
		edges: new Map(),
		outgoing: new Map(),
		incoming: new Map(),
	};
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
	index.edges.set(edge.id, edge);
	ensureAdjacency(index, edge.source);
	ensureAdjacency(index, edge.target);
	index.outgoing.get(edge.source)?.add(edge.id);
	index.incoming.get(edge.target)?.add(edge.id);
}

function ensureAdjacency(index: KnowledgeIndex, nodeId: NodeId): void {
	if (!index.outgoing.has(nodeId)) {
		index.outgoing.set(nodeId, new Set());
	}
	if (!index.incoming.has(nodeId)) {
		index.incoming.set(nodeId, new Set());
	}
}
