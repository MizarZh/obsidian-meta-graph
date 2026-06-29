import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	GlobalStyleConfig,
	LinkStyleRule,
	NodeStyleRule,
} from '../../core/types';
import {
	BASE_STYLE_RULE_ID,
	BUILT_IN_DEFAULT_LINK_STYLE,
	BUILT_IN_DEFAULT_NODE_STYLE,
} from './constants';
import {
	isRecord,
	normalizeArray,
	readBoolean,
	readFiniteNumber,
	readLinkLineStyle,
	readOptionalBoolean,
	readOptionalFiniteNumber,
	readOptionalLinkLineStyle,
	readOptionalStyleColor,
	readOptionalStyleLabel,
	readStyleColor,
	readStyleLabel,
} from './utils';

export function createDefaultNodeStyleRule(): NodeStyleRule {
	return {
		id: BASE_STYLE_RULE_ID,
		field: 'all',
		value: '',
		color: BUILT_IN_DEFAULT_NODE_STYLE.color,
		size: BUILT_IN_DEFAULT_NODE_STYLE.size,
	};
}

export function createDefaultLinkStyleRule(): LinkStyleRule {
	return {
		id: BASE_STYLE_RULE_ID,
		field: 'all',
		value: '',
		color: BUILT_IN_DEFAULT_LINK_STYLE.color,
		size: BUILT_IN_DEFAULT_LINK_STYLE.size,
		lineStyle: BUILT_IN_DEFAULT_LINK_STYLE.lineStyle,
		label: BUILT_IN_DEFAULT_LINK_STYLE.label,
		showLabel: BUILT_IN_DEFAULT_LINK_STYLE.showLabel,
		hidden: BUILT_IN_DEFAULT_LINK_STYLE.hidden,
	};
}

export function normalizeNodeStyleRules(value: unknown): NodeStyleRule[] {
	const allRules = normalizeArray<NodeStyleRule>(value);
	return allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeLinkStyleRules(value: unknown): LinkStyleRule[] {
	const allRules = normalizeArray<LinkStyleRule>(value);
	return allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeGlobalNodeStyleRules(value: unknown): NodeStyleRule[] {
	return normalizeArray<NodeStyleRule>(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeGlobalLinkStyleRules(value: unknown): LinkStyleRule[] {
	return normalizeArray<LinkStyleRule>(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeGlobalStyle(value: unknown): GlobalStyleConfig {
	const record = isRecord(value) ? value : {};
	const legacyNodeBase = readBaseNodeStyleRule(record.nodeRules);
	const legacyLinkBase = readBaseLinkStyleRule(record.linkRules);
	return {
		defaultNodeStyle: normalizeDefaultNodeStyle(
			record.defaultNodeStyle,
			legacyNodeBase,
		),
		defaultLinkStyle: normalizeDefaultLinkStyle(
			record.defaultLinkStyle,
			legacyLinkBase,
		),
		nodeRules: normalizeGlobalNodeStyleRules(record.nodeRules),
		linkRules: normalizeGlobalLinkStyleRules(record.linkRules),
	};
}

export function createDefaultGlobalStyle(): GlobalStyleConfig {
	return {
		defaultNodeStyle: { ...BUILT_IN_DEFAULT_NODE_STYLE },
		defaultLinkStyle: { ...BUILT_IN_DEFAULT_LINK_STYLE },
		nodeRules: [],
		linkRules: [],
	};
}

export function normalizeDefaultNodeStyle(
	value: unknown,
	legacyBase?: NodeStyleRule,
): Required<DefaultNodeStyle> {
	const record = isRecord(value) ? value : {};
	return {
		color: readStyleColor(
			record.color ?? legacyBase?.color,
			BUILT_IN_DEFAULT_NODE_STYLE.color,
		),
		size: readFiniteNumber(
			record.size ?? legacyBase?.size,
			BUILT_IN_DEFAULT_NODE_STYLE.size,
		),
	};
}

export function normalizeDefaultLinkStyle(
	value: unknown,
	legacyBase?: LinkStyleRule,
): Required<DefaultLinkStyle> {
	const record = isRecord(value) ? value : {};
	return {
		color: readStyleColor(
			record.color ?? legacyBase?.color,
			BUILT_IN_DEFAULT_LINK_STYLE.color,
		),
		size: readFiniteNumber(
			record.size ?? legacyBase?.size,
			BUILT_IN_DEFAULT_LINK_STYLE.size,
		),
		lineStyle: readLinkLineStyle(
			record.lineStyle ?? legacyBase?.lineStyle,
			BUILT_IN_DEFAULT_LINK_STYLE.lineStyle,
		),
		label: readStyleLabel(record.label ?? legacyBase?.label),
		showLabel: readBoolean(
			record.showLabel ?? legacyBase?.showLabel,
			BUILT_IN_DEFAULT_LINK_STYLE.showLabel,
		),
		hidden: readBoolean(
			record.hidden ?? legacyBase?.hidden,
			BUILT_IN_DEFAULT_LINK_STYLE.hidden,
		),
	};
}

export function normalizeNodeStyleOverrides(
	value: unknown,
	legacyBase: NodeStyleRule | undefined,
	defaults: Required<DefaultNodeStyle>,
): DefaultNodeStyle {
	const record = isRecord(value) ? value : {};
	const overrides: DefaultNodeStyle = {};
	const color = readOptionalStyleColor(record.color ?? legacyBase?.color);
	const size = readOptionalFiniteNumber(record.size ?? legacyBase?.size);
	if (color !== undefined && color !== defaults.color) {
		overrides.color = color;
	}
	if (size !== undefined && size !== defaults.size) {
		overrides.size = size;
	}
	return overrides;
}

export function normalizeLinkStyleOverrides(
	value: unknown,
	legacyBase: LinkStyleRule | undefined,
	defaults: Required<DefaultLinkStyle>,
): DefaultLinkStyle {
	const record = isRecord(value) ? value : {};
	const overrides: DefaultLinkStyle = {};
	const color = readOptionalStyleColor(record.color ?? legacyBase?.color);
	const size = readOptionalFiniteNumber(record.size ?? legacyBase?.size);
	const lineStyle = readOptionalLinkLineStyle(
		record.lineStyle ?? legacyBase?.lineStyle,
	);
	const label = readOptionalStyleLabel(record.label ?? legacyBase?.label);
	const showLabel = readOptionalBoolean(
		record.showLabel ?? legacyBase?.showLabel,
	);
	const hidden = readOptionalBoolean(record.hidden ?? legacyBase?.hidden);
	if (color !== undefined && color !== defaults.color) {
		overrides.color = color;
	}
	if (size !== undefined && size !== defaults.size) {
		overrides.size = size;
	}
	if (lineStyle !== undefined && lineStyle !== defaults.lineStyle) {
		overrides.lineStyle = lineStyle;
	}
	if (label !== undefined && label !== defaults.label) {
		overrides.label = label;
	}
	if (showLabel !== undefined && showLabel !== defaults.showLabel) {
		overrides.showLabel = showLabel;
	}
	if (hidden !== undefined && hidden !== defaults.hidden) {
		overrides.hidden = hidden;
	}
	return overrides;
}

export function readBaseNodeStyleRule(
	value: unknown,
): NodeStyleRule | undefined {
	return normalizeArray<NodeStyleRule>(value).find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
}

export function readBaseLinkStyleRule(
	value: unknown,
): LinkStyleRule | undefined {
	return normalizeArray<LinkStyleRule>(value).find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
}
