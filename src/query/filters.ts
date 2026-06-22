import type {
	GraphQuery,
	KnowledgeEdge,
	KnowledgeNode,
	NodeFilterField,
	NodeFilterOperator,
} from '../core/types';

export function nodeMatchesFilters(
	node: KnowledgeNode,
	query: GraphQuery,
	globalQuery?: GraphQuery,
): boolean {
	return (
		nodeMatchesQueryFilters(node, globalQuery) &&
		nodeMatchesQueryFilters(node, query)
	);
}

function nodeMatchesQueryFilters(
	node: KnowledgeNode,
	query: GraphQuery | undefined,
): boolean {
	if (!query) {
		return true;
	}
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
		showRules.every((rule) => matchesFilterRule(node, rule));
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
	const operator = rule.operator ?? 'is';
	if (!value && operator !== 'has-value' && operator !== 'empty') {
		return false;
	}
	return matchesNodeCriterion(node, rule.field, operator, rule.value);
}

export function matchesNodeCriterion(
	node: KnowledgeNode,
	field: NodeFilterField,
	operator: NodeFilterOperator = 'is',
	value = '',
): boolean {
	const normalizedValue = value.trim().toLocaleLowerCase();
	if (
		(field === 'folder' || field === 'file.folder') &&
		(operator === 'is' || operator === 'is-not') &&
		normalizedValue
	) {
		const folder = node.folder.toLocaleLowerCase();
		const matches = folder === normalizedValue || folder.startsWith(`${normalizedValue}/`);
		return operator === 'is' ? matches : !matches;
	}
	const values = getNodeCriterionValues(node, field)
		.map((item) => item.trim())
		.filter(Boolean);
	if (operator === 'has-value') {
		return values.length > 0;
	}
	if (operator === 'empty') {
		return values.length === 0;
	}
	if (!normalizedValue) {
		return false;
	}
	const normalizedValues = values.map((item) => item.toLocaleLowerCase());
	switch (operator) {
		case 'is':
			return normalizedValues.some((item) => item === normalizedValue);
		case 'is-not':
			return normalizedValues.every((item) => item !== normalizedValue);
		case 'contains':
			return normalizedValues.some((item) => item.includes(normalizedValue));
		case 'does-not-contain':
			return normalizedValues.every((item) => !item.includes(normalizedValue));
	}
}

function getNodeCriterionValues(
	node: KnowledgeNode,
	field: NodeFilterField,
): string[] {
	switch (field) {
		case 'folder':
		case 'file.folder':
			return node.folder ? [node.folder] : [];
		case 'tag':
		case 'file.tags':
			return node.tags;
		case 'file.name':
			return [node.fileName ?? `${node.title}.${node.extension ?? 'md'}`];
		case 'file.basename':
			return [node.title];
		case 'file.path':
			return [node.path];
		case 'file.ext':
			return node.extension ? [node.extension] : [];
		case 'file.links':
			return node.links ?? [];
		case 'metadata-field':
			return node.metadataFields ?? [];
	}
}

export function edgeMatchesFilters(
	edge: KnowledgeEdge,
	query: GraphQuery,
	globalQuery?: GraphQuery,
): boolean {
	return (
		edgeMatchesQueryFilters(edge, globalQuery) &&
		edgeMatchesQueryFilters(edge, query)
	);
}

function edgeMatchesQueryFilters(
	edge: KnowledgeEdge,
	query: GraphQuery | undefined,
): boolean {
	return !query || query.relations.length === 0 || query.relations.includes(edge.relation);
}
