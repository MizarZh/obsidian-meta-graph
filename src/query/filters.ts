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
			(folder) =>
				node.folder === folder || node.folder.startsWith(`${folder}/`),
		);
	const domainMatches =
		query.domains.length === 0 ||
		query.domains.some((domain) => node.domains.includes(domain));
	const tagMatches =
		query.tags.length === 0 ||
		query.tags.some((tag) => node.tags.includes(tag));
	const rootMatches =
		query.filterRoot &&
		(query.filterRoot.children.length > 0 ||
			query.hiddenNodeRules.length === 0)
			? matchesFilterGroup(node, query.filterRoot)
			: matchesLegacyFilterRules(node, query.hiddenNodeRules);
	return folderMatches && domainMatches && tagMatches && rootMatches;
}

function matchesLegacyFilterRules(
	node: KnowledgeNode,
	rules: GraphQuery['hiddenNodeRules'],
): boolean {
	const showRules = rules.filter(
		(rule) => rule.action === 'show' && rule.value.trim(),
	);
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

export function nodeMatchesFilterGroup(
	node: KnowledgeNode,
	group: NodeFilterGroup,
): boolean {
	return matchesFilterGroup(node, group);
}

function matchesFilterGroup(
	node: KnowledgeNode,
	group: NodeFilterGroup,
): boolean {
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
	if (
		!value &&
		!['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(operator)
	) {
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
			folder === normalizedValue ||
			folder.startsWith(`${normalizedValue}/`);
		return operator === 'is' ? matches : !matches;
	}
	const values = getNodeCriterionValues(node, field)
		.map((item) => item.trim())
		.filter(Boolean);
	if (operator === 'has-value') {
		return values.length > 0;
	}
	if (operator === 'empty' || operator === 'is-empty') {
		return values.length === 0;
	}
	if (operator === 'is-not-empty') {
		return values.length > 0;
	}
	if (!normalizedValue) {
		return false;
	}
	const normalizedValues = values.map((item) => item.toLocaleLowerCase());
	const expectedValues = splitFilterValues(normalizedValue);
	switch (operator) {
		case 'links-to':
			return getNodeCriterionValues(node, 'file.links').some(
				(item) => item.toLocaleLowerCase() === normalizedValue,
			);
		case 'does-not-link-to':
			return getNodeCriterionValues(node, 'file.links').every(
				(item) => item.toLocaleLowerCase() !== normalizedValue,
			);
		case 'in-folder':
			return matchesNodeCriterion(node, 'file.folder', 'is', value);
		case 'is-not-in-folder':
			return matchesNodeCriterion(node, 'file.folder', 'is-not', value);
		case 'has-tag':
			return matchesNodeCriterion(node, 'file.tags', 'is', value);
		case 'does-not-have-tag':
			return matchesNodeCriterion(node, 'file.tags', 'is-not', value);
		case 'has-property':
			return matchesNodeCriterion(node, 'metadata-field', 'is', value);
		case 'does-not-have-property':
			return matchesNodeCriterion(
				node,
				'metadata-field',
				'is-not',
				value,
			);
		case 'is':
		case 'eq':
			return normalizedValues.some((item) => item === normalizedValue);
		case 'on':
			return normalizedValues.some((item) =>
				sameFilterDate(item, normalizedValue),
			);
		case 'is-not':
		case 'neq':
			return normalizedValues.every((item) => item !== normalizedValue);
		case 'not-on':
			return normalizedValues.every(
				(item) => !sameFilterDate(item, normalizedValue),
			);
		case 'starts-with':
			return normalizedValues.some((item) =>
				item.startsWith(normalizedValue),
			);
		case 'ends-with':
			return normalizedValues.some((item) =>
				item.endsWith(normalizedValue),
			);
		case 'contains':
			return normalizedValues.some((item) =>
				item.includes(normalizedValue),
			);
		case 'contains-any-of':
			return expectedValues.some((expected) =>
				normalizedValues.some((item) => item.includes(expected)),
			);
		case 'contains-all-of':
			return expectedValues.every((expected) =>
				normalizedValues.some((item) => item.includes(expected)),
			);
		case 'does-not-start-with':
			return normalizedValues.every(
				(item) => !item.startsWith(normalizedValue),
			);
		case 'does-not-end-with':
			return normalizedValues.every(
				(item) => !item.endsWith(normalizedValue),
			);
		case 'does-not-contain':
			return normalizedValues.every(
				(item) => !item.includes(normalizedValue),
			);
		case 'does-not-contain-any-of':
			return expectedValues.every((expected) =>
				normalizedValues.every((item) => !item.includes(expected)),
			);
		case 'does-not-contain-all-of':
			return !expectedValues.every((expected) =>
				normalizedValues.some((item) => item.includes(expected)),
			);
		case 'before':
		case 'lt':
			return normalizedValues.some(
				(item) => compareFilterValues(item, normalizedValue) < 0,
			);
		case 'on-or-before':
		case 'lte':
			return normalizedValues.some(
				(item) => compareFilterValues(item, normalizedValue) <= 0,
			);
		case 'after':
		case 'gt':
			return normalizedValues.some(
				(item) => compareFilterValues(item, normalizedValue) > 0,
			);
		case 'on-or-after':
		case 'gte':
			return normalizedValues.some(
				(item) => compareFilterValues(item, normalizedValue) >= 0,
			);
		case 'is-exactly':
			return normalizedValues.join(',') === expectedValues.join(',');
		case 'is-not-exactly':
			return normalizedValues.join(',') !== expectedValues.join(',');
	}
}

function splitFilterValues(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function compareFilterValues(left: string, right: string): number {
	const leftNumber = parseComparableValue(left);
	const rightNumber = parseComparableValue(right);
	return leftNumber - rightNumber;
}

function parseComparableValue(value: string): number {
	const numeric = Number(value);
	if (Number.isFinite(numeric)) {
		return numeric;
	}
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function sameFilterDate(left: string, right: string): boolean {
	const leftDate = new Date(parseComparableValue(left));
	const rightDate = new Date(parseComparableValue(right));
	if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
		return false;
	}
	return (
		leftDate.getFullYear() === rightDate.getFullYear() &&
		leftDate.getMonth() === rightDate.getMonth() &&
		leftDate.getDate() === rightDate.getDate()
	);
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
	if (typeof value === 'string') {
		return [value];
	}
	if (
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint' ||
		typeof value === 'symbol'
	) {
		return [String(value)];
	}
	return [];
}

export function edgeMatchesFilters(
	edge: KnowledgeEdge,
	query: GraphQuery,
	globalQuery?: GraphQuery,
): boolean {
	if (isPlainLinkEdge(edge)) {
		return query.showPlainLinks;
	}
	return (
		edgeMatchesQueryFilters(edge, globalQuery) &&
		edgeMatchesQueryFilters(edge, query)
	);
}

function isPlainLinkEdge(edge: KnowledgeEdge): boolean {
	return edge.kind === 'plain-link' || edge.semantic === false;
}

function edgeMatchesQueryFilters(
	edge: KnowledgeEdge,
	query: GraphQuery | undefined,
): boolean {
	return (
		!query ||
		query.relations.length === 0 ||
		query.relations.includes(edge.relation)
	);
}
