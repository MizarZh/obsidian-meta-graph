import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkLineStyle,
	LinkStyleRule,
	NodeFilterField,
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
	const operator = rule.operator ?? 'is';
	if (
		!rule.value.trim() &&
		!['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(operator)
	) {
		return false;
	}
	if (rule.field === 'group') {
		return matchesNodeGroup(context, operator, rule.value);
	}
	return matchesNodeCriterion(
		node,
		rule.field as NodeFilterField,
		operator,
		rule.value,
	);
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
