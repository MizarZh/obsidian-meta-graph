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
		options: { showPlainLinks?: boolean } = {},
	): GraphProjection {
		const primaryIds = new Set<NodeId>();
		const hiddenNodeIds = new Set<NodeId>();
		for (const file of curated.files) {
			if (index.nodes.has(file.path)) {
				primaryIds.add(file.path);
				if (file.hidden) {
					hiddenNodeIds.add(file.path);
				}
			}
		}

		const edges: KnowledgeEdge[] = [];
		for (const edge of index.edges.values()) {
			if (isPlainLinkEdge(edge) && !options.showPlainLinks) {
				continue;
			}
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
			hiddenNodeIds,
		};
	}
}

function isPlainLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'plain-link' || edge.semantic === false;
}
