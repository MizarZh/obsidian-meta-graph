import type {
	EdgeId,
	GraphProjection,
	GraphQuery,
	KnowledgeEdge,
	KnowledgeIndex,
	NodeId,
} from '../core/types';
import { edgeMatchesFilters, nodeMatchesFilters } from './filters';

interface QueueItem {
	nodeId: NodeId;
	depth: number;
}

export class GraphQueryEngine {
	project(
		index: KnowledgeIndex,
		query: GraphQuery,
		globalQuery?: GraphQuery,
	): GraphProjection {
		if (query.roots.length === 0) {
			return this.projectGlobal(index, query, globalQuery);
		}

		const roots = query.roots.filter((root) => index.nodes.has(root));
		const rootIds = new Set(roots);
		const included = new Set<NodeId>();
		const visited = new Set<NodeId>();
		const queue: QueueItem[] = [];

		for (const root of roots) {
			if (included.size >= query.maxNodes) {
				break;
			}
			included.add(root);
			visited.add(root);
			queue.push({ nodeId: root, depth: 0 });
		}

		let cursor = 0;
		while (cursor < queue.length && included.size < query.maxNodes) {
			const item = queue[cursor++];
			if (!item || item.depth >= query.depth) {
				continue;
			}

			for (const { edge, neighbor } of this.getTraversableEdges(
				index,
				item.nodeId,
				query,
			)) {
				if (
					!edgeMatchesFilters(edge, query, globalQuery) ||
					visited.has(neighbor)
				) {
					continue;
				}
				visited.add(neighbor);
				const node = index.nodes.get(neighbor);
				if (
					!node ||
					(!rootIds.has(neighbor) &&
						!nodeMatchesFilters(node, query, globalQuery))
				) {
					continue;
				}
				if (included.size >= query.maxNodes) {
					break;
				}
				included.add(neighbor);
				queue.push({ nodeId: neighbor, depth: item.depth + 1 });
			}
		}

		const edges = [...index.edges.values()].filter(
			(edge) =>
				included.has(edge.source) &&
				included.has(edge.target) &&
				edgeMatchesFilters(edge, query, globalQuery),
		);
		const connectedNodeIds = new Set<NodeId>();
		for (const edge of edges) {
			connectedNodeIds.add(edge.source);
			connectedNodeIds.add(edge.target);
		}
		const nodes = [...connectedNodeIds]
			.map((nodeId) => index.nodes.get(nodeId))
			.filter((node) => node !== undefined);
		const visibleRootIds = new Set(
			[...rootIds].filter((rootId) => connectedNodeIds.has(rootId)),
		);

		return { nodes, edges, rootIds: visibleRootIds };
	}

	private projectGlobal(
		index: KnowledgeIndex,
		query: GraphQuery,
		globalQuery?: GraphQuery,
	): GraphProjection {
		const includedNodeIds = new Set<NodeId>();
		const edges: KnowledgeEdge[] = [];

		for (const edge of index.edges.values()) {
			if (!edgeMatchesFilters(edge, query, globalQuery)) {
				continue;
			}
			const source = index.nodes.get(edge.source);
			const target = index.nodes.get(edge.target);
			if (
				!source ||
				!target ||
				!nodeMatchesFilters(source, query, globalQuery) ||
				!nodeMatchesFilters(target, query, globalQuery)
			) {
				continue;
			}

			const additionalNodes =
				Number(!includedNodeIds.has(edge.source)) +
				Number(!includedNodeIds.has(edge.target));
			if (includedNodeIds.size + additionalNodes > query.maxNodes) {
				continue;
			}

			includedNodeIds.add(edge.source);
			includedNodeIds.add(edge.target);
			edges.push(edge);
		}

		if (query.showIsolatedNodes) {
			for (const [nodeId, node] of index.nodes) {
				if (includedNodeIds.size >= query.maxNodes) {
					break;
				}
				if (
					!includedNodeIds.has(nodeId) &&
					nodeMatchesFilters(node, query, globalQuery)
				) {
					includedNodeIds.add(nodeId);
				}
			}
		}

		const nodes = [...includedNodeIds]
			.map((nodeId) => index.nodes.get(nodeId))
			.filter((node) => node !== undefined);
		return { nodes, edges, rootIds: new Set() };
	}

	private getTraversableEdges(
		index: KnowledgeIndex,
		nodeId: NodeId,
		query: GraphQuery,
	): Array<{ edge: KnowledgeEdge; neighbor: NodeId }> {
		const edgeIds = new Set<EdgeId>();
		if (query.direction !== 'incoming') {
			for (const edgeId of index.outgoing.get(nodeId) ?? []) {
				edgeIds.add(edgeId);
			}
		}
		if (query.direction !== 'outgoing') {
			for (const edgeId of index.incoming.get(nodeId) ?? []) {
				edgeIds.add(edgeId);
			}
		}

		for (const edgeId of index.outgoing.get(nodeId) ?? []) {
			if (index.edges.get(edgeId)?.directed === false) {
				edgeIds.add(edgeId);
			}
		}
		for (const edgeId of index.incoming.get(nodeId) ?? []) {
			if (index.edges.get(edgeId)?.directed === false) {
				edgeIds.add(edgeId);
			}
		}

		const result: Array<{ edge: KnowledgeEdge; neighbor: NodeId }> = [];
		for (const edgeId of edgeIds) {
			const edge = index.edges.get(edgeId);
			if (!edge) {
				continue;
			}
			const neighbor = edge.source === nodeId ? edge.target : edge.source;
			result.push({ edge, neighbor });
		}
		return result;
	}
}
