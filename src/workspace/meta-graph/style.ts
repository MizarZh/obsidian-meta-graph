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
	BUILT_IN_DEFAULT_PLAIN_LINK_STYLE,
	BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE,
	BUILT_IN_DEFAULT_UNRESOLVED_LINK_STYLE,
} from './constants';
import {
	isRecord,
	normalizeArray,
	readBoolean,
	readFiniteNumber,
	readLinkArrowSize,
	readLinkArrowStyle,
	readLinkLineStyle,
	readOptionalBoolean,
	readOptionalFiniteNumber,
	readOptionalLinkArrowSize,
	readOptionalLinkArrowStyle,
	readOptionalLinkLineStyle,
	readLinkOpacity,
	readOptionalLinkOpacity,
	readOptionalNodeShape,
	readOptionalStyleColor,
	readOptionalStyleLabel,
	readNodeShape,
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
		shape: BUILT_IN_DEFAULT_NODE_STYLE.shape,
	};
}

export function createDefaultLinkStyleRule(): LinkStyleRule {
	return {
		id: BASE_STYLE_RULE_ID,
		field: 'all',
		value: '',
		color: BUILT_IN_DEFAULT_LINK_STYLE.color,
		size: BUILT_IN_DEFAULT_LINK_STYLE.size,
		opacity: BUILT_IN_DEFAULT_LINK_STYLE.opacity,
		lineStyle: BUILT_IN_DEFAULT_LINK_STYLE.lineStyle,
		arrowStyle: BUILT_IN_DEFAULT_LINK_STYLE.arrowStyle,
		arrowSize: BUILT_IN_DEFAULT_LINK_STYLE.arrowSize,
		label: BUILT_IN_DEFAULT_LINK_STYLE.label,
		showLabel: BUILT_IN_DEFAULT_LINK_STYLE.showLabel,
		hidden: BUILT_IN_DEFAULT_LINK_STYLE.hidden,
	};
}

export function normalizeNodeStyleRules(value: unknown): NodeStyleRule[] {
	const allRules = normalizeNodeStyleRuleArray(value);
	return allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeLinkStyleRules(value: unknown): LinkStyleRule[] {
	const allRules = normalizeLinkStyleRuleArray(value);
	return allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

export function normalizeGlobalNodeStyleRules(value: unknown): NodeStyleRule[] {
	return normalizeNodeStyleRuleArray(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

function normalizeNodeStyleRuleArray(value: unknown): NodeStyleRule[] {
	return normalizeArray<NodeStyleRule>(value).map((rule) => {
		const record: Record<string, unknown> = isRecord(rule) ? rule : {};
		const shape = readOptionalNodeShape(record.shape);
		const withoutShape = { ...record };
		delete withoutShape.shape;
		return shape
			? ({ ...withoutShape, shape } as NodeStyleRule)
			: (withoutShape as unknown as NodeStyleRule);
	});
}

export function normalizeGlobalLinkStyleRules(value: unknown): LinkStyleRule[] {
	return normalizeLinkStyleRuleArray(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
}

function normalizeLinkStyleRuleArray(value: unknown): LinkStyleRule[] {
	return normalizeArray<LinkStyleRule>(value).map((rule) => {
		const record: Record<string, unknown> = isRecord(rule) ? rule : {};
		const normalized = { ...record };
		if (record.lineStyle !== undefined) {
			normalized.lineStyle = readLinkLineStyle(record.lineStyle, 'solid');
		}
		if (record.arrowStyle !== undefined) {
			const arrowStyle = readOptionalLinkArrowStyle(record.arrowStyle);
			if (arrowStyle) {
				normalized.arrowStyle = arrowStyle;
			} else {
				delete normalized.arrowStyle;
			}
		}
		if (record.opacity !== undefined) {
			const opacity = readOptionalLinkOpacity(record.opacity);
			if (opacity !== undefined) {
				normalized.opacity = opacity;
			} else {
				delete normalized.opacity;
			}
		}
		if (record.arrowSize !== undefined) {
			const arrowSize = readOptionalLinkArrowSize(record.arrowSize);
			if (arrowSize !== undefined) {
				normalized.arrowSize = arrowSize;
			} else {
				delete normalized.arrowSize;
			}
		}
		return normalized as unknown as LinkStyleRule;
	});
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
		shape: readNodeShape(
			record.shape ?? legacyBase?.shape,
			BUILT_IN_DEFAULT_NODE_STYLE.shape,
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
		opacity: readLinkOpacity(
			record.opacity ?? legacyBase?.opacity,
			BUILT_IN_DEFAULT_LINK_STYLE.opacity,
		),
		lineStyle: readLinkLineStyle(
			record.lineStyle ?? legacyBase?.lineStyle,
			BUILT_IN_DEFAULT_LINK_STYLE.lineStyle,
		),
		arrowStyle: readLinkArrowStyle(
			record.arrowStyle ?? legacyBase?.arrowStyle,
			BUILT_IN_DEFAULT_LINK_STYLE.arrowStyle,
		),
		arrowSize: readLinkArrowSize(
			record.arrowSize ?? legacyBase?.arrowSize,
			BUILT_IN_DEFAULT_LINK_STYLE.arrowSize,
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
	const shape = readOptionalNodeShape(record.shape ?? legacyBase?.shape);
	if (color !== undefined && color !== defaults.color) {
		overrides.color = color;
	}
	if (size !== undefined && size !== defaults.size) {
		overrides.size = size;
	}
	if (shape !== undefined && shape !== defaults.shape) {
		overrides.shape = shape;
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
	const opacity = readOptionalLinkOpacity(
		record.opacity ?? legacyBase?.opacity,
	);
	const lineStyle = readOptionalLinkLineStyle(
		record.lineStyle ?? legacyBase?.lineStyle,
	);
	const arrowStyle = readOptionalLinkArrowStyle(
		record.arrowStyle ?? legacyBase?.arrowStyle,
	);
	const arrowSize = readOptionalLinkArrowSize(
		record.arrowSize ?? legacyBase?.arrowSize,
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
	if (opacity !== undefined && opacity !== defaults.opacity) {
		overrides.opacity = opacity;
	}
	if (lineStyle !== undefined && lineStyle !== defaults.lineStyle) {
		overrides.lineStyle = lineStyle;
	}
	if (arrowStyle !== undefined && arrowStyle !== defaults.arrowStyle) {
		overrides.arrowStyle = arrowStyle;
	}
	if (arrowSize !== undefined && arrowSize !== defaults.arrowSize) {
		overrides.arrowSize = arrowSize;
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

export function normalizePlainLinkStyleOverrides(
	value: unknown,
): DefaultLinkStyle {
	return normalizeLinkStyleOverrides(
		value,
		undefined,
		BUILT_IN_DEFAULT_PLAIN_LINK_STYLE,
	);
}

export function normalizeUnresolvedNodeStyleOverrides(
	value: unknown,
): DefaultNodeStyle {
	return normalizeNodeStyleOverrides(
		value,
		undefined,
		BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE,
	);
}

export function normalizeUnresolvedLinkStyleOverrides(
	value: unknown,
): DefaultLinkStyle {
	return normalizeLinkStyleOverrides(
		value,
		undefined,
		BUILT_IN_DEFAULT_UNRESOLVED_LINK_STYLE,
	);
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
