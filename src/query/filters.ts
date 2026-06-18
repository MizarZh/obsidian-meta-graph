import type { GraphQuery, KnowledgeEdge, KnowledgeNode } from '../core/types';

export function nodeMatchesFilters(
	node: KnowledgeNode,
	query: GraphQuery,
): boolean {
	const folderMatches =
		query.folders.length === 0 ||
		query.folders.some(
			(folder) => node.folder === folder || node.folder.startsWith(`${folder}/`),
		);
	const domainMatches =
		query.domains.length === 0 ||
		query.domains.some((domain) => node.domains.includes(domain));
	return folderMatches && domainMatches;
}

export function edgeMatchesFilters(
	edge: KnowledgeEdge,
	query: GraphQuery,
): boolean {
	return query.relations.length === 0 || query.relations.includes(edge.relation);
}
