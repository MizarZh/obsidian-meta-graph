import type {
	KnowledgeEdge,
	KnowledgeNode,
	LinkArrowStyle,
	LinkLineStyle,
	LinkStyleRule,
	NodeFilterOperator,
	NodeShape,
	NodeStyleRule,
} from '../../core/types';
import { matchesNodeCriterion } from '../../query/filters';

export interface NodeStyle {
	color: string;
	size: number;
	shape: NodeShape;
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

export function resolveLinkArrowStyle(
	edge: KnowledgeEdge,
	rules: LinkStyleRule[],
	defaultStyle: LinkArrowStyle = 'filled',
): LinkArrowStyle {
	return rules.reduce(
		(style, rule) =>
			matchesLinkRule(edge, rule) && isLinkArrowStyle(rule.arrowStyle)
				? rule.arrowStyle
				: style,
		defaultStyle,
	);
}

export function resolveLinkOpacity(
	edge: KnowledgeEdge,
	rules: LinkStyleRule[],
	defaultStyle = 1,
): number {
	return rules.reduce(
		(style, rule) =>
			matchesLinkRule(edge, rule) && isLinkOpacity(rule.opacity)
				? rule.opacity
				: style,
		clampLinkOpacity(defaultStyle),
	);
}

export function resolveLinkArrowSize(
	edge: KnowledgeEdge,
	rules: LinkStyleRule[],
	defaultStyle = 1,
): number {
	return rules.reduce(
		(style, rule) =>
			matchesLinkRule(edge, rule) && isLinkArrowSize(rule.arrowSize)
				? rule.arrowSize
				: style,
		clampLinkArrowSize(defaultStyle),
	);
}

export function isLinkArrowStyle(value: unknown): value is LinkArrowStyle {
	return value === 'filled' || value === 'chevron';
}

export function isLinkOpacity(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isLinkArrowSize(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function clampLinkOpacity(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function clampLinkArrowSize(value: number): number {
	return Math.max(0.25, Math.min(3, value));
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
				? {
						color: rule.color || style.color,
						size: rule.size,
						shape: isNodeShape(rule.shape)
							? rule.shape
							: style.shape,
					}
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

function isNodeShape(value: unknown): value is NodeShape {
	return (
		value === 'circle' ||
		value === 'square' ||
		value === 'diamond' ||
		value === 'triangle' ||
		value === 'hexagon' ||
		value === 'star'
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
	return matchesNodeCriterion(node, rule.field, operator, rule.value);
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
	const operator = rule.operator ?? 'is';
	if (
		!rule.value.trim() &&
		!['has-value', 'empty', 'is-empty', 'is-not-empty'].includes(operator)
	) {
		return false;
	}
	const candidate =
		rule.field === 'relation' ? edge.relation : edge.sourceField;
	return matchesLinkValue(candidate, operator, rule.value);
}

function matchesLinkValue(
	candidate: string,
	operator: NodeFilterOperator,
	value: string,
): boolean {
	const normalizedCandidate = candidate.trim().toLocaleLowerCase();
	const normalizedValue = value.trim().toLocaleLowerCase();
	if (operator === 'has-value' || operator === 'is-not-empty') {
		return normalizedCandidate.length > 0;
	}
	if (operator === 'empty' || operator === 'is-empty') {
		return normalizedCandidate.length === 0;
	}
	if (!normalizedValue) {
		return false;
	}
	switch (operator) {
		case 'is':
		case 'eq':
		case 'is-exactly':
			return normalizedCandidate === normalizedValue;
		case 'is-not':
		case 'neq':
		case 'is-not-exactly':
			return normalizedCandidate !== normalizedValue;
		case 'contains':
		case 'contains-any-of':
			return normalizedCandidate.includes(normalizedValue);
		case 'does-not-contain':
		case 'does-not-contain-any-of':
			return !normalizedCandidate.includes(normalizedValue);
		case 'starts-with':
			return normalizedCandidate.startsWith(normalizedValue);
		case 'does-not-start-with':
			return !normalizedCandidate.startsWith(normalizedValue);
		case 'ends-with':
			return normalizedCandidate.endsWith(normalizedValue);
		case 'does-not-end-with':
			return !normalizedCandidate.endsWith(normalizedValue);
		default:
			return normalizedCandidate === normalizedValue;
	}
}
