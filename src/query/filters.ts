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
	const tagMatches =
		query.tags.length === 0 ||
		query.tags.some((tag) => node.tags.includes(tag));
	const showRules = query.hiddenNodeRules.filter(
		(rule) => rule.action === 'show' && rule.value.trim(),
	);
	const showMatches =
		showRules.length === 0 ||
		showRules.some((rule) => matchesFilterRule(node, rule));
	const hidden = query.hiddenNodeRules.some(
		(rule) => rule.action === 'hide' && matchesFilterRule(node, rule),
	);
	return folderMatches && domainMatches && tagMatches && showMatches && !hidden;
}

function matchesFilterRule(
	node: KnowledgeNode,
	rule: GraphQuery['hiddenNodeRules'][number],
): boolean {
	const value = rule.value.trim().toLocaleLowerCase();
	if (!value) {
		return false;
	}
	if (rule.field === 'folder') {
		const folder = node.folder.toLocaleLowerCase();
		return folder === value || folder.startsWith(`${value}/`);
	}
	return node.tags.some((tag) => tag.toLocaleLowerCase() === value);
}

export function edgeMatchesFilters(
	edge: KnowledgeEdge,
	query: GraphQuery,
): boolean {
	return query.relations.length === 0 || query.relations.includes(edge.relation);
}
