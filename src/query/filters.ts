import type {
	GraphQuery,
	KnowledgeEdge,
	KnowledgeNode,
	NodeFilterCondition,
	NodeFilterField,
	NodeFilterGroup,
	NodeFilterItem,
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
		query.tags.length === 0 || query.tags.some((tag) => node.tags.includes(tag));
	const rootMatches =
		query.filterRoot &&
		(query.filterRoot.children.length > 0 || query.hiddenNodeRules.length === 0)
			? matchesFilterGroup(node, query.filterRoot)
			: matchesLegacyFilterRules(node, query.hiddenNodeRules);
	return folderMatches && domainMatches && tagMatches && rootMatches;
}

function matchesLegacyFilterRules(
	node: KnowledgeNode,
	rules: GraphQuery['hiddenNodeRules'],
): boolean {
	const showRules = rules.filter((rule) => rule.action === 'show' && rule.value.trim());
	const showMatches =
		showRules.length === 0 ||
		showRules.every((rule) => matchesFilterCondition(node, rule));
	const hidden = rules.some(
		(rule) => rule.action === 'hide' && matchesFilterCondition(node, rule),
	);
	return showMatches && !hidden;
}

function matchesFilterItem(node: KnowledgeNode, item: NodeFilterItem): boolean {
	return item.kind === 'group'
		? matchesFilterGroup(node, item)
		: matchesFilterCondition(node, item);
}

function matchesFilterGroup(node: KnowledgeNode, group: NodeFilterGroup): boolean {
	if (group.children.length === 0) {
		return true;
	}
	if (group.mode === 'any') {
		return group.children.some((item) => matchesFilterItem(node, item));
	}
	if (group.mode === 'none') {
		return !group.children.some((item) => matchesFilterItem(node, item));
	}
	return group.children.every((item) => matchesFilterItem(node, item));
}

function matchesFilterCondition(
	node: KnowledgeNode,
	rule: Pick<NodeFilterCondition, 'field' | 'operator' | 'value'>,
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
		const matches =
			folder === normalizedValue || folder.startsWith(`${normalizedValue}/`);
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
	if (field.startsWith('metadata.')) {
		return valueToStrings(node.metadata?.[field.slice('metadata.'.length)]);
	}
	switch (field) {
		case 'file.file':
		case 'file.path':
			return [node.path];
		case 'folder':
		case 'file.folder':
			return node.folder ? [node.folder] : [];
		case 'tag':
		case 'file.tags':
			return node.tags;
		case 'file.name':
		case 'file.fullname':
			return [node.fileName ?? `${node.title}.${node.extension ?? 'md'}`];
		case 'file.basename':
			return [node.title];
		case 'file.ext':
			return node.extension ? [node.extension] : [];
		case 'file.ctime':
			return node.createdTime ? [String(node.createdTime)] : [];
		case 'file.mtime':
			return node.modifiedTime ? [String(node.modifiedTime)] : [];
		case 'file.size':
			return node.fileSize === undefined ? [] : [String(node.fileSize)];
		case 'file.links':
			return node.links ?? [];
		case 'file.embeds':
			return node.embeds ?? [];
		case 'aliases':
			return node.aliases ?? [];
		case 'metadata-field':
			return node.metadataFields ?? [];
	}
	return [];
}

function valueToStrings(value: unknown): string[] {
	if (value === null || value === undefined) {
		return [];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => valueToStrings(item));
	}
	if (value instanceof Date) {
		return [String(value.getTime()), value.toISOString()];
	}
	if (typeof value === 'object') {
		return [JSON.stringify(value)];
	}
	return [String(value)];
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
