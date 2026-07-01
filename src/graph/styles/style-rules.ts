import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
} from '../../core/types';
import { matchesNodeCriterion } from '../../query/filters';

export interface NodeStyle {
	color: string;
	size: number;
}

export interface NodeStyleContext {
	groupIds?: readonly string[];
	groupNames?: readonly string[];
}

export interface LinkStyle {
	color: string;
	size: number;
	lineStyle: LinkLineStyle;
	label: string;
	hidden: boolean;
}

export function resolveNodeStyle(
	node: KnowledgeNode,
	rules: NodeStyleRule[],
	defaults: NodeStyle,
	context: NodeStyleContext = {},
): NodeStyle {
	return rules.reduce(
		(style, rule) =>
			matchesNodeRule(node, rule, context)
				? { color: rule.color || style.color, size: rule.size }
				: style,
		{ ...defaults },
	);
}

export function resolveLinkStyle(
	edge: KnowledgeEdge,
	rules: LinkStyleRule[],
	defaults: LinkStyle,
): LinkStyle {
	return rules.reduce(
		(style, rule) =>
			matchesLinkRule(edge, rule)
				? {
						color: rule.color || style.color,
						size: rule.size,
						lineStyle: rule.lineStyle,
						label: rule.showLabel
							? rule.label.trim() || edge.relation
							: '',
						hidden: rule.hidden,
					}
				: style,
		{ ...defaults },
	);
}

function matchesNodeRule(
	node: KnowledgeNode,
	rule: NodeStyleRule,
	context: NodeStyleContext,
): boolean {
	if (rule.field === 'all') {
		return true;
	}
	const value = rule.value.trim().toLocaleLowerCase();
	const operator = rule.operator ?? 'is';
	if (
		!value &&
		!['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(operator)
	) {
		return false;
	}
	switch (rule.field) {
		case 'folder':
		case 'tag':
		case 'file.name':
		case 'file.basename':
		case 'file.path':
		case 'file.folder':
		case 'file.ext':
		case 'file.links':
		case 'file.tags':
		case 'metadata-field':
			return matchesNodeCriterion(node, rule.field, operator, rule.value);
		case 'domain':
			return node.domains.some(
				(domain) => domain.toLocaleLowerCase() === value,
			);
		case 'group':
			return matchesNodeGroup(context, operator, rule.value);
		case 'type':
			return node.noteType?.toLocaleLowerCase() === value;
		case 'title':
			return node.title.toLocaleLowerCase() === value;
	}
}

function matchesNodeGroup(
	context: NodeStyleContext,
	operator: string,
	value: string,
): boolean {
	const values = [...(context.groupIds ?? []), ...(context.groupNames ?? [])]
		.map((item) => item.trim().toLocaleLowerCase())
		.filter(Boolean);
	if (
		operator === 'has-value' ||
		operator === 'is-not-empty' ||
		operator === 'has-property'
	) {
		return values.length > 0;
	}
	if (
		operator === 'empty' ||
		operator === 'is-empty' ||
		operator === 'does-not-have-property'
	) {
		return values.length === 0;
	}
	const expected = value.trim().toLocaleLowerCase();
	if (!expected) {
		return false;
	}
	switch (operator) {
		case 'is':
		case 'eq':
		case 'is-exactly':
			return values.some((item) => item === expected);
		case 'is-not':
		case 'neq':
		case 'is-not-exactly':
			return values.every((item) => item !== expected);
		case 'contains':
		case 'contains-any-of':
			return values.some((item) => item.includes(expected));
		case 'does-not-contain':
		case 'does-not-contain-any-of':
			return values.every((item) => !item.includes(expected));
		case 'starts-with':
			return values.some((item) => item.startsWith(expected));
		case 'does-not-start-with':
			return values.every((item) => !item.startsWith(expected));
		case 'ends-with':
			return values.some((item) => item.endsWith(expected));
		case 'does-not-end-with':
			return values.every((item) => !item.endsWith(expected));
		default:
			return values.some((item) => item === expected);
	}
}

function matchesLinkRule(edge: KnowledgeEdge, rule: LinkStyleRule): boolean {
	if (rule.field === 'all') {
		return true;
	}
	const value = rule.value.trim().toLocaleLowerCase();
	if (!value) {
		return false;
	}
	return rule.field === 'relation'
		? edge.relation.toLocaleLowerCase() === value
		: edge.sourceField.toLocaleLowerCase() === value;
}
