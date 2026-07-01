import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	LinkLineStyle,
	LinkStyleRule,
	NodeStyleRule,
} from '../../core/types';

export type StyleRuleKind = 'node' | 'link';
export type StyleRuleScope = 'global' | 'current';

export function createNodeStyleRule(id: string): NodeStyleRule {
	return {
		id,
		field: 'metadata-field',
		operator: 'has-value',
		value: '',
		color: '#7c6ff0',
		size: 7,
	};
}

export function createLinkStyleRule(id: string): LinkStyleRule {
	return {
		id,
		field: 'source-field',
		operator: 'is',
		value: '',
		color: '#888888',
		size: 1.5,
		lineStyle: 'solid',
		label: '',
		showLabel: false,
		hidden: false,
	};
}

export function patchRule<T extends { id: string }>(
	rules: T[],
	id: string,
	patch: Partial<T>,
): T[] {
	return rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule));
}

export function removeRule<T extends { id: string }>(
	rules: T[],
	id: string,
): T[] {
	return rules.filter((rule) => rule.id !== id);
}

export function canMoveRule<T extends { id: string }>(
	rules: T[],
	id: string,
	direction: -1 | 1,
): boolean {
	const index = rules.findIndex((rule) => rule.id === id);
	const targetIndex = index + direction;
	return index >= 0 && targetIndex >= 0 && targetIndex < rules.length;
}

export function moveRule<T extends { id: string }>(
	rules: T[],
	id: string,
	direction: -1 | 1,
): T[] {
	const index = rules.findIndex((rule) => rule.id === id);
	const targetIndex = index + direction;
	if (index < 0 || targetIndex < 0 || targetIndex >= rules.length) {
		return rules;
	}
	const next = [...rules];
	const current = next[index];
	const target = next[targetIndex];
	if (!current || !target) {
		return rules;
	}
	next[index] = target;
	next[targetIndex] = current;
	return next;
}

export function activeNodeStyleValue(
	overrides: DefaultNodeStyle,
	defaultStyle: Required<DefaultNodeStyle>,
	field: keyof DefaultNodeStyle,
): string | number {
	return overrides[field] ?? defaultStyle[field];
}

export function activeLinkStyleValue(
	overrides: DefaultLinkStyle,
	defaultStyle: Required<DefaultLinkStyle>,
	field: keyof DefaultLinkStyle,
): string | number | boolean {
	return overrides[field] ?? defaultStyle[field];
}

export function activeLinkLineStyle(
	overrides: DefaultLinkStyle,
	defaultStyle: Required<DefaultLinkStyle>,
): LinkLineStyle {
	return activeLinkStyleValue(
		overrides,
		defaultStyle,
		'lineStyle',
	) as LinkLineStyle;
}

export function hasStyleOverride(
	style: DefaultNodeStyle | DefaultLinkStyle,
): boolean {
	return Object.keys(style).length > 0;
}
