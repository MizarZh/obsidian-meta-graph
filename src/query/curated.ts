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
		options: {
			showPlainLinks?: boolean;
			showUnresolvedLinks?: boolean;
		} = {},
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
		const contextIds = new Set<NodeId>();
		for (const edge of index.edges.values()) {
			if (isUnresolvedLinkEdge(edge) && !options.showUnresolvedLinks) {
				continue;
			}
			if (isPlainLinkEdge(edge) && !options.showPlainLinks) {
				continue;
			}
			if (primaryIds.has(edge.source) && primaryIds.has(edge.target)) {
				edges.push(edge);
				continue;
			}
			if (
				isUnresolvedLinkEdge(edge) &&
				options.showUnresolvedLinks &&
				primaryIds.has(edge.source) &&
				index.nodes.has(edge.target)
			) {
				edges.push(edge);
				contextIds.add(edge.target);
			}
		}

		const nodes = [...primaryIds, ...contextIds]
			.map((nodeId) => index.nodes.get(nodeId))
			.filter((node) => node !== undefined);

		return {
			nodes,
			edges,
			rootIds: new Set(primaryIds),
			primaryIds,
			contextIds,
			hiddenNodeIds,
		};
	}
}

function isPlainLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'plain-link' || (!edge.kind && edge.semantic === false);
}

function isUnresolvedLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'unresolved-link';
}
