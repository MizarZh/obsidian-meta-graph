import type {
	CuratedWorkspaceConfig,
	GraphProjection,
	KnowledgeEdge,
	KnowledgeIndex,
	NodeId,
} from '../core/types';

export class CuratedProjectionEngine {
	project(
		index: KnowledgeIndex,
		curated: CuratedWorkspaceConfig,
	): GraphProjection {
		const primaryIds = new Set<NodeId>();
		for (const file of curated.files) {
			if (index.nodes.has(file.path)) {
				primaryIds.add(file.path);
			}
		}

		const edges: KnowledgeEdge[] = [];
		for (const edge of index.edges.values()) {
			if (primaryIds.has(edge.source) && primaryIds.has(edge.target)) {
				edges.push(edge);
			}
		}

		const nodes = [...primaryIds]
			.map((nodeId) => index.nodes.get(nodeId))
			.filter((node) => node !== undefined);

		return {
			nodes,
			edges,
			rootIds: new Set(primaryIds),
			primaryIds,
			contextIds: new Set(),
		};
	}
}
