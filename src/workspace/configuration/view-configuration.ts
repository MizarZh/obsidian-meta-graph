import type {
	ChartDisplayConfig,
	ChartGroupDefinition,
	ChartLayoutConfig,
	ChartPresentationConfig,
	ChartStyleConfig,
	MetaGraphChart,
	ViewMode,
	WorkspaceState,
} from '@/core/types';
import { CHART_TYPE_ORDER } from '@/core/chart-types';
import {
	normalizeNodeStyleOverrides,
	normalizeLinkStyleOverrides,
} from '@/workspace/meta-graph/style';
import type { DefaultNodeStyle, DefaultLinkStyle } from '@/core/types';
import { normalizeChart } from '@/workspace/meta-graph/chart';
import { cloneSerializable } from '@/workspace/state/persistence';
import { updateActiveChartState } from '@/workspace/state/state-updaters';

export const CONFIGURATION_PARTS = [
	'styles',
	'layout',
	'panels',
	'groups',
] as const;
export type ConfigurationPart = (typeof CONFIGURATION_PARTS)[number];
export type ConfigurationSelection = Record<ConfigurationPart, boolean>;
export const DEFAULT_CONFIGURATION_SELECTION: ConfigurationSelection = {
	styles: true,
	layout: false,
	panels: false,
	groups: false,
};
const STYLE_DISPLAY = [
	'nodeBadges',
	'parallelEdgeStyle',
	'fadeDistance',
	'labelSize',
	'scaleLabelsWithZoom',
	'threeLabelResolution',
	'labelBold',
	'labelItalic',
	'labelPosition',
	'labelOffset',
	'labelMaxWidth',
	'labelLightTextColor',
	'labelLightBackgroundColor',
	'labelLightBackgroundOpacity',
	'labelDarkTextColor',
	'labelDarkBackgroundColor',
	'labelDarkBackgroundOpacity',
	'labelDensity',
	'cubeFaceOpacity',
	'forceLabels',
] as const;
const LAYOUT_DISPLAY = [
	'cubeSize',
	'cubeFreeCamera',
	'enableForceLayout',
] as const;
const PANEL_DISPLAY = [
	'showLegend',
	'showMinimap',
	'showTrace',
	'overlayLayout',
	'showInspector',
	'showFilters',
] as const;
const LAYOUT_KEYS = [
	'engine',
	'spacing',
	'centerForce',
	'repelForce',
	'linkForce',
	'dragLinkForce',
	'returnForce',
	'linkDistance',
	'layerSpacing',
	'laneSpacing',
	'direction',
	'flowRelationRules',
	'arcDirection',
	'arcLabelAngle',
	'nodeSort',
	'nodeSortDirection',
	'edgeStyle',
	'cornerRadius',
] as const;
const PRESENTATION_KEYS = [
	'showInspector',
	'showFilters',
	'dockWidth',
	'curatedPanelWidth',
	'focusOnSelect',
] as const;

export interface ViewConfiguration {
	format: 'meta-graph-configuration';
	version: 1;
	name: string;
	sourceType: ViewMode;
	styles?: { style: ChartStyleConfig; display: Partial<ChartDisplayConfig> };
	layout?: {
		settings: Omit<ChartLayoutConfig, 'manual'>;
		display: Partial<ChartDisplayConfig>;
	};
	panels?: {
		display: Partial<ChartDisplayConfig>;
		presentation: ChartPresentationConfig;
		timelineEnabled: boolean;
	};
	groups?: ChartGroupDefinition[];
}
function pick<T extends object, K extends keyof T>(
	value: T,
	keys: readonly K[],
): Pick<T, K> {
	return Object.fromEntries(
		keys
			.filter((key) => value[key] !== undefined)
			.map((key) => [key, value[key]]),
	) as Pick<T, K>;
}
function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function configurationAvailable(
	config: ViewConfiguration,
	target: MetaGraphChart,
	part: ConfigurationPart,
): boolean {
	if (config[part] === undefined) return false;
	if (part === 'layout') return config.sourceType === target.type;
	if (part === 'groups')
		return (
			!['cube', 'graph-3d'].includes(config.sourceType) &&
			!['cube', 'graph-3d'].includes(target.type)
		);
	return true;
}
export function captureViewConfiguration(
	chart: MetaGraphChart,
	selection: ConfigurationSelection,
	workspace?: WorkspaceState,
): ViewConfiguration {
	const config: ViewConfiguration = {
		format: 'meta-graph-configuration',
		version: 1,
		name: chart.name,
		sourceType: chart.type,
	};
	if (selection.styles) {
		const style = cloneSerializable(chart.style);
		// Export workspace defaults/rules as chart-local settings; never modify target globals.
		if (workspace) {
			style.nodeOverrides = {
				...workspace.defaultNodeStyle,
				...style.nodeOverrides,
			};
			style.linkOverrides = {
				...workspace.defaultLinkStyle,
				...style.linkOverrides,
			};
			style.nodeRules = [
				...workspace.globalNodeStyleRules,
				...style.nodeRules,
			].map((rule, index) => ({ ...rule, id: `config-node-${index}` }));
			style.linkRules = [
				...workspace.globalLinkStyleRules,
				...style.linkRules,
			].map((rule, index) => ({ ...rule, id: `config-link-${index}` }));
		}
		// Group names survive transfers when only styles are selected.
		style.nodeRules = style.nodeRules.map((rule) =>
			rule.field === 'group'
				? {
						...rule,
						value:
							chart.grouping.groups.find(
								(group) => group.id === rule.value,
							)?.name ?? rule.value,
					}
				: rule,
		);
		config.styles = { style, display: pick(chart.display, STYLE_DISPLAY) };
	}
	if (selection.layout)
		config.layout = {
			settings: pick(chart.layout, LAYOUT_KEYS),
			display: pick(chart.display, LAYOUT_DISPLAY),
		};
	if (selection.panels)
		config.panels = {
			display: pick(chart.display, PANEL_DISPLAY),
			presentation: pick(chart.presentation, PRESENTATION_KEYS),
			timelineEnabled: chart.display.timeline.enabled,
		};
	if (selection.groups && !['cube', 'graph-3d'].includes(chart.type))
		config.groups = chart.grouping.groups;
	return cloneSerializable(config);
}

/** Validate and canonicalize imported data; reject empty/foreign configuration files. */
export function parseViewConfiguration(text: string): ViewConfiguration {
	if (text.length > 2_000_000)
		throw new Error('Configuration file is too large.');
	const raw: unknown = JSON.parse(text);
	if (
		!record(raw) ||
		raw.format !== 'meta-graph-configuration' ||
		raw.version !== 1 ||
		!CHART_TYPE_ORDER.includes(raw.sourceType as ViewMode)
	)
		throw new Error('Unsupported configuration file.');
	for (const key of ['styles', 'layout', 'panels'] as const) {
		if (raw[key] !== undefined && !record(raw[key]))
			throw new Error(`Invalid ${key} configuration.`);
	}
	if (
		raw.groups !== undefined &&
		(!Array.isArray(raw.groups) || !raw.groups.every(record))
	)
		throw new Error('Invalid groups configuration.');
	const styles = record(raw.styles) ? raw.styles : undefined;
	const layout = record(raw.layout) ? raw.layout : undefined;
	const panels = record(raw.panels) ? raw.panels : undefined;
	if (
		styles &&
		(!record(styles.style) ||
			!record(styles.display) ||
			!Array.isArray(styles.style.nodeRules) ||
			!Array.isArray(styles.style.linkRules))
	)
		throw new Error('Invalid styles configuration.');
	if (layout && (!record(layout.settings) || !record(layout.display)))
		throw new Error('Invalid layout configuration.');
	if (
		panels &&
		(!record(panels.display) ||
			!record(panels.presentation) ||
			typeof panels.timelineEnabled !== 'boolean')
	)
		throw new Error('Invalid panels configuration.');
	const chart = normalizeChart(
		{
			type: raw.sourceType,
			name:
				typeof raw.name === 'string'
					? raw.name
					: 'Imported configuration',
			style: styles?.style,
			layout: layout?.settings,
			display: {
				...(styles?.display as object),
				...(layout?.display as object),
				...(panels?.display as object),
				timeline: { enabled: panels?.timelineEnabled },
			},
			presentation: panels?.presentation,
			grouping: { groups: raw.groups, overrides: {} },
		},
		0,
		200,
		1.5,
	);
	// A configuration must retain explicit values even when they equal built-in
	// defaults: the destination workspace may have different defaults.
	if (styles && record(styles.style)) {
		chart.style.nodeOverrides = normalizeNodeStyleOverrides(
			styles.style.nodeOverrides,
			undefined,
			{} as Required<DefaultNodeStyle>,
		);
		chart.style.linkOverrides = normalizeLinkStyleOverrides(
			styles.style.linkOverrides,
			undefined,
			{} as Required<DefaultLinkStyle>,
		);
	}
	const config = captureViewConfiguration(chart, {
		styles: !!styles,
		layout: !!layout,
		panels: !!panels,
		groups: raw.groups !== undefined,
	});
	if (!CONFIGURATION_PARTS.some((part) => config[part] !== undefined))
		throw new Error('The configuration file contains no settings.');
	return config;
}

export function applyViewConfigurationInState(
	state: WorkspaceState,
	input: ViewConfiguration,
	selection: ConfigurationSelection,
	targetId: string,
): WorkspaceState {
	if (state.activeChartId !== targetId)
		throw new Error('The target view changed. Reopen Apply configuration.');
	const target = state.charts.find((chart) => chart.id === targetId)!;
	const config = parseViewConfiguration(JSON.stringify(input));
	const selected = CONFIGURATION_PARTS.filter((part) => selection[part]);
	if (!selected.length) return state;
	for (const part of selected)
		if (!configurationAvailable(config, target, part))
			throw new Error(`${part} is unavailable for this view.`);
	const patch: Partial<MetaGraphChart> = {};
	const display = { ...target.display };
	if (selection.styles && config.styles) {
		patch.style = cloneSerializable(config.styles.style);
		Object.assign(display, pick(config.styles.display, STYLE_DISPLAY));
	}
	if (selection.layout && config.layout) {
		patch.layout = {
			...config.layout.settings,
			...(target.layout.manual ? { manual: target.layout.manual } : {}),
		};
		Object.assign(display, pick(config.layout.display, LAYOUT_DISPLAY));
	}
	if (selection.panels && config.panels) {
		Object.assign(display, pick(config.panels.display, PANEL_DISPLAY));
		display.timeline = {
			...target.display.timeline,
			enabled: config.panels.timelineEnabled,
		};
		patch.presentation = {
			...target.presentation,
			...config.panels.presentation,
		};
	}
	if (selection.groups && config.groups) {
		const groups = cloneSerializable(target.grouping.groups);
		const names = new Map<string, string>();
		for (const group of config.groups) {
			let id = group.id,
				name = group.name,
				suffix = 2;
			while (groups.some((existing) => existing.id === id))
				id = `${group.id}-${suffix++}`;
			suffix = 2;
			while (groups.some((existing) => existing.name === name))
				name = `${group.name} (${suffix++})`;
			groups.push({ ...group, id, name });
			names.set(group.name, name);
		}
		patch.grouping = {
			groups,
			overrides: { ...target.grouping.overrides },
		};
		const layout = patch.layout ?? target.layout;
		const normalized = normalizeChart(
			{
				...target,
				grouping: patch.grouping,
				layout: {
					...layout,
					manual: layout.manual ?? { nodes: {}, groups: [] },
				},
			},
			0,
			state.query.maxNodes,
			display.fadeDistance,
		);
		patch.layout = {
			...layout,
			manual: {
				...layout.manual,
				nodes: layout.manual?.nodes ?? {},
				groups: layout.manual?.groups ?? [],
				groupFrames: normalized.layout.manual?.groupFrames,
			},
		};
		if (patch.style)
			patch.style.nodeRules = patch.style.nodeRules.map((rule) =>
				rule.field === 'group' && names.has(rule.value)
					? { ...rule, value: names.get(rule.value)! }
					: rule,
			);
	}
	patch.display = display;
	const next = updateActiveChartState(
		state,
		patch,
		selection.layout || !!patch.grouping,
	);
	if (!patch.grouping) next.grouping = state.grouping;
	if (!patch.layout) next.manualLayout = state.manualLayout;
	if (patch.presentation)
		next.dock = {
			...next.dock,
			dockWidth: patch.presentation.dockWidth,
			curatedPanelWidth: patch.presentation.curatedPanelWidth,
			focusOnSelect: patch.presentation.focusOnSelect,
		};
	return next;
}
