import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	WorkspaceState,
} from '@/core/types';
import {
	getDefaultNodeStyleOperator,
	getNodeStyleFieldOptions,
	getNodeStyleOperatorOptions,
	TEXT_FILTER_OPERATOR_OPTIONS,
} from '@/ui/filter-config';
import {
	styleRuleCaption,
	styleRuleCondition,
} from '@/ui/filter/style-rule-caption';

export interface LegendEntry {
	id: string;
	name: string;
	condition: string;
	scope: 'Default' | 'Global' | 'Chart';
	node?: Required<DefaultNodeStyle>;
	line?: Required<DefaultLinkStyle>;
}

type LegendState = Pick<
	WorkspaceState,
	| 'defaultNodeStyle'
	| 'defaultLinkStyle'
	| 'nodeStyleOverrides'
	| 'linkStyleOverrides'
	| 'globalNodeStyleRules'
	| 'globalLinkStyleRules'
	| 'nodeStyleRules'
	| 'linkStyleRules'
	| 'grouping'
>;

function mergeStyle<T extends object>(base: T, overrides: Partial<T>): T {
	return {
		...base,
		...Object.fromEntries(
			Object.entries(overrides).filter(
				([, value]) => value !== undefined,
			),
		),
	};
}

/** Configured styles, not a claim that every rule matches the current projection. */
export function buildGraphLegend(
	state: LegendState,
	metadataFields: string[] = [],
	metadataTypes: Record<string, string> = {},
): { nodes: LegendEntry[]; links: LegendEntry[] } {
	const node = mergeStyle(state.defaultNodeStyle, state.nodeStyleOverrides);
	const line = mergeStyle(state.defaultLinkStyle, state.linkStyleOverrides);
	const nodes: LegendEntry[] = [
		{
			id: 'default-node',
			name: 'Default nodes',
			condition: 'Base style including chart overrides',
			scope: 'Default',
			node,
		},
	];
	const links: LegendEntry[] = [
		{
			id: 'default-link',
			name: 'Default links',
			condition: 'Base style including chart overrides',
			scope: 'Default',
			line,
		},
	];
	const fields = getNodeStyleFieldOptions(metadataFields, metadataTypes);
	for (const scope of ['Global', 'Chart'] as const) {
		for (const rule of scope === 'Global'
			? state.globalNodeStyleRules
			: state.nodeStyleRules) {
			const operator =
				rule.operator ??
				getDefaultNodeStyleOperator(rule.field, metadataTypes);
			const condition =
				rule.field === 'all'
					? 'All nodes'
					: styleRuleCondition(
							fields.find((field) => field.value === rule.field)
								?.label ?? rule.field,
							getNodeStyleOperatorOptions(
								rule.field,
								metadataTypes,
							).find((option) => option.value === operator)
								?.label ?? operator,
							rule.field === 'group'
								? (state.grouping.groups.find(
										(group) => group.id === rule.value,
									)?.name ?? rule.value)
								: rule.value,
						);
			nodes.push({
				id: `${scope}:node:${rule.id}`,
				name: styleRuleCaption(rule.name, condition, '').title,
				condition,
				scope,
				node: {
					color: rule.color,
					size: rule.size,
					shape: rule.shape ?? 'circle',
					opacity: rule.opacity ?? 1,
				},
			});
		}
		for (const rule of scope === 'Global'
			? state.globalLinkStyleRules
			: state.linkStyleRules) {
			const operator = rule.operator ?? 'is';
			const condition =
				rule.field === 'all'
					? 'All links'
					: styleRuleCondition(
							rule.field === 'source-field'
								? 'Source field'
								: 'Relation',
							TEXT_FILTER_OPERATOR_OPTIONS.find(
								(option) => option.value === operator,
							)?.label ?? operator,
							rule.value,
						);
			links.push({
				id: `${scope}:link:${rule.id}`,
				name: styleRuleCaption(rule.name, condition, '').title,
				condition,
				scope,
				line: {
					...rule,
					opacity: rule.opacity ?? 1,
					arrowStyle: rule.arrowStyle ?? 'filled',
					arrowSize: rule.arrowSize ?? 1,
				},
			});
		}
	}
	return { nodes, links };
}
