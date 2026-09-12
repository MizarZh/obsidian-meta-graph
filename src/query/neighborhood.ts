import type {
	EdgeId,
	GraphProjection,
	GraphQuery,
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	NodeId,
} from '@/core/types';
import { edgeMatchesFilters, nodeMatchesFilters } from '@/query/filters';
import { getOutgoingEdgesInIndexOrder } from '@/core/knowledge-index';

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
		if (query.relationExpansion?.enabled) {
			return this.projectExpanded(index, query, globalQuery);
		}
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

		const edges = getOutgoingEdgesInIndexOrder(index, included).filter(
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

	private projectExpanded(
		index: KnowledgeIndex,
		query: GraphQuery,
		globalQuery?: GraphQuery,
	): GraphProjection {
		const expansion = query.relationExpansion!;
		const seedQuery = {
			...query,
			relationExpansion: undefined,
			showIsolatedNodes: true,
		};
		const seeds = this.project(index, seedQuery, globalQuery);
		const included = new Set(
			seeds.nodes
				.filter(
					(node) =>
						!globalQuery || nodeMatchesFilters(node, globalQuery),
				)
				.map((node) => node.id),
		);
		// Root neighborhoods normally omit isolated roots; they still seed expansion.
		for (const root of query.roots) {
			const node = index.nodes.get(root);
			if (
				included.size < query.maxNodes &&
				node &&
				(!globalQuery || nodeMatchesFilters(node, globalQuery))
			)
				included.add(root);
		}
		const coreIds = new Set(included);
		const queue = [...included].map((nodeId) => ({ nodeId, depth: 0 }));
		const traversalQuery = { ...query, direction: 'both' as const };
		const rules = new Map(
			expansion.fieldRules?.map((rule) => [rule.field, rule]),
		);
		const fields = new Set(expansion.fields);
		const matchesExpansionEdge = (edge: KnowledgeEdge): boolean =>
			(edge.kind === undefined || edge.kind === 'relation') &&
			(expansion.allFields ||
				fields.has(edge.sourceField) ||
				fields.has(edge.relation)) &&
			edgeMatchesFilters(edge, query, globalQuery);
		for (
			let cursor = 0;
			cursor < queue.length && included.size < query.maxNodes;
			cursor++
		) {
			const item = queue[cursor]!;

			for (const { edge, neighbor } of this.getTraversableEdges(
				index,
				item.nodeId,
				traversalQuery,
			)) {
				if (included.has(neighbor) || !matchesExpansionEdge(edge))
					continue;
				const rule = expansion.allFields
					? expansion
					: ((fields.has(edge.sourceField)
							? rules.get(edge.sourceField)
							: rules.get(edge.relation)) ?? expansion);
				if (item.depth >= rule.depth) continue;
				if (
					edge.directed &&
					((rule.direction === 'incoming' &&
						edge.target !== item.nodeId) ||
						(rule.direction === 'outgoing' &&
							edge.source !== item.nodeId))
				)
					continue;
				const node = index.nodes.get(neighbor);
				// Shared filters define the boundary; current-view filters select seeds only.
				if (
					!node ||
					(globalQuery && !nodeMatchesFilters(node, globalQuery))
				)
					continue;
				included.add(neighbor);
				queue.push({ nodeId: neighbor, depth: item.depth + 1 });
				if (included.size >= query.maxNodes) break;
			}
		}
		const edges = getOutgoingEdgesInIndexOrder(index, included).filter(
			(edge) =>
				included.has(edge.source) &&
				included.has(edge.target) &&
				((coreIds.has(edge.source) &&
					coreIds.has(edge.target) &&
					edgeMatchesFilters(edge, query, globalQuery)) ||
					matchesExpansionEdge(edge)),
		);
		if (!query.showIsolatedNodes) {
			const connected = new Set(
				edges.flatMap((edge) => [edge.source, edge.target]),
			);
			for (const id of included)
				if (!connected.has(id)) included.delete(id);
		}
		return {
			nodes: [...included].map((id) => index.nodes.get(id)!),
			edges,
			rootIds: new Set(query.roots.filter((id) => included.has(id))),
			contextIds: new Set([...included].filter((id) => !coreIds.has(id))),
		};
	}

	private projectGlobal(
		index: KnowledgeIndex,
		query: GraphQuery,
		globalQuery?: GraphQuery,
	): GraphProjection {
		const includedNodeIds = new Set<NodeId>();
		const edges: KnowledgeEdge[] = [];
		const nodeFilterMatches = new Map<NodeId, boolean>();
		const matchesNode = (node: KnowledgeNode): boolean => {
			const cached = nodeFilterMatches.get(node.id);
			if (cached !== undefined) {
				return cached;
			}
			const matches = nodeMatchesFilters(node, query, globalQuery);
			nodeFilterMatches.set(node.id, matches);
			return matches;
		};

		for (const edge of index.edges.values()) {
			if (!edgeMatchesFilters(edge, query, globalQuery)) {
				continue;
			}
			const source = index.nodes.get(edge.source);
			const target = index.nodes.get(edge.target);
			if (
				!source ||
				!target ||
				!matchesNode(source) ||
				!matchesNode(target)
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
				if (node.kind === 'unresolved' && !query.showUnresolvedLinks) {
					continue;
				}
				if (!includedNodeIds.has(nodeId) && matchesNode(node)) {
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
