import type {
	ChartSource,
	GlobalStyleConfig,
	MetaGraphChart,
	ViewMode,
} from '../../core/types';
import {
	DEFAULT_CUBE_FACE_OPACITY,
	DEFAULT_FORCE_LABELS,
	DEFAULT_LABEL_BACKGROUND_OPACITY,
	DEFAULT_LABEL_COLOR,
	DEFAULT_LABEL_DARK_BACKGROUND_COLOR,
	DEFAULT_LABEL_DARK_BACKGROUND_OPACITY,
	DEFAULT_LABEL_DARK_TEXT_COLOR,
	DEFAULT_LABEL_DENSITY,
	DEFAULT_LABEL_LIGHT_BACKGROUND_COLOR,
	DEFAULT_LABEL_LIGHT_BACKGROUND_OPACITY,
	DEFAULT_LABEL_LIGHT_TEXT_COLOR,
	DEFAULT_LABEL_OFFSET,
	DEFAULT_LABEL_POSITION,
	DEFAULT_LABEL_SIZE,
} from './constants';
import {
	createDefaultCuratedWorkspace,
	normalizeCuratedWorkspace,
} from './curated';
import { hydrateCuratedManualLayout } from './curated-layout';
import { createDefaultLayout, normalizeLayout } from './layout';
import { createDefaultQuery, normalizeQuery } from './query';
import {
	createDefaultGlobalStyle,
	normalizeLinkStyleOverrides,
	normalizeLinkStyleRules,
	normalizeNodeStyleOverrides,
	normalizeNodeStyleRules,
	normalizePlainLinkStyleOverrides,
	normalizeUnresolvedNodeStyleOverrides,
	normalizeUnresolvedLinkStyleOverrides,
	readBaseLinkStyleRule,
	readBaseNodeStyleRule,
} from './style';
import {
	clampNumber,
	isRecord,
	readBoolean,
	readFiniteNumber,
	readLabelPosition,
} from './utils';

export function createDefaultChart(
	type: ViewMode,
	maxNodes: number,
	fadeDistance: number,
	existingCharts: MetaGraphChart[] = [],
): MetaGraphChart {
	const baseId = getDefaultChartId(type);
	const id = createUniqueChartId(baseId, existingCharts);
	const name = createUniqueChartName(
		getDefaultChartName(type),
		existingCharts,
	);
	return {
		id,
		name,
		type,
		source: 'query',
		query: createDefaultQuery(maxNodes, type),
		curated: createDefaultCuratedWorkspace(),
		layout: createDefaultLayout(type),
		display: {
				fadeDistance,
				labelSize: DEFAULT_LABEL_SIZE,
				labelPosition: DEFAULT_LABEL_POSITION,
				labelOffset: DEFAULT_LABEL_OFFSET,
			labelColor: DEFAULT_LABEL_COLOR,
			labelLightTextColor: DEFAULT_LABEL_LIGHT_TEXT_COLOR,
				labelLightBackgroundColor: DEFAULT_LABEL_LIGHT_BACKGROUND_COLOR,
				labelLightBackgroundOpacity: DEFAULT_LABEL_LIGHT_BACKGROUND_OPACITY,
				labelDarkTextColor: DEFAULT_LABEL_DARK_TEXT_COLOR,
				labelDarkBackgroundColor: DEFAULT_LABEL_DARK_BACKGROUND_COLOR,
			labelDarkBackgroundOpacity: DEFAULT_LABEL_DARK_BACKGROUND_OPACITY,
			labelBackgroundOpacity: DEFAULT_LABEL_BACKGROUND_OPACITY,
			labelDensity: DEFAULT_LABEL_DENSITY,
			cubeFaceOpacity: DEFAULT_CUBE_FACE_OPACITY,
			forceLabels: DEFAULT_FORCE_LABELS,
			enableForceLayout: false,
			showInspector: true,
			showFilters: true,
		},
		style: {
			nodeOverrides: {},
			unresolvedNodeOverrides: {},
			linkOverrides: {},
			plainLinkOverrides: {},
			unresolvedLinkOverrides: {},
			nodeRules: [],
			linkRules: [],
		},
	};
}

export function createDefaultCharts(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphChart[] {
	const graph = createDefaultChart('graph', maxNodes, fadeDistance);
	const flow = createDefaultChart('flow', maxNodes, fadeDistance, [graph]);
	const arc = createDefaultChart('arc', maxNodes, fadeDistance, [
		graph,
		flow,
	]);
	return [graph, flow, arc];
}

export function normalizeChart(
	value: unknown,
	index: number,
	maxNodes: number,
	fadeDistance: number,
	globalStyle: GlobalStyleConfig = createDefaultGlobalStyle(),
): MetaGraphChart {
	const record = isRecord(value) ? value : {};
	const type = readViewMode(record.type);
	const fallback = createDefaultChart(type, maxNodes, fadeDistance);
	const source = normalizeChartSource(record.source);
	const styleRecord = isRecord(record.style) ? record.style : {};
	const legacyNodeBase = readBaseNodeStyleRule(styleRecord.nodeRules);
	const legacyLinkBase = readBaseLinkStyleRule(styleRecord.linkRules);
	const display = isRecord(record.display) ? record.display : {};
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: `${fallback.id}-${index + 1}`;
	const curated = normalizeCuratedWorkspace(
		record.curated ?? record.workspace,
	);
	const layout = normalizeLayout(record.layout, fallback.layout, type);
	const hydrated = hydrateCuratedManualLayout(source, curated, layout);
	return {
		id,
		name:
			typeof record.name === 'string' && record.name.trim()
				? record.name.trim()
				: fallback.name,
		type,
		source,
		query: normalizeQuery(record.query, fallback.query, maxNodes),
		curated: hydrated.curated,
		layout: hydrated.layout,
		display: {
			fadeDistance: readFiniteNumber(
				display.fadeDistance,
				fallback.display.fadeDistance,
			),
			labelSize: readFiniteNumber(
				display.labelSize,
				fallback.display.labelSize,
			),
				labelPosition: readLabelPosition(
					display.labelPosition,
					fallback.display.labelPosition,
				),
				labelOffset: readFiniteNumber(
					display.labelOffset,
					fallback.display.labelOffset,
				),
			labelColor:
				typeof display.labelColor === 'string'
					? display.labelColor.trim()
					: fallback.display.labelColor,
				labelLightTextColor: readColorString(
					display.labelLightTextColor,
					fallback.display.labelLightTextColor,
				),
				labelLightBackgroundColor: readColorString(
					display.labelLightBackgroundColor,
					fallback.display.labelLightBackgroundColor,
				),
				labelLightBackgroundOpacity: clampNumber(
					readFiniteNumber(
						display.labelLightBackgroundOpacity,
						fallback.display.labelLightBackgroundOpacity,
					),
					0,
					1,
				),
				labelDarkTextColor: readColorString(
					display.labelDarkTextColor,
					fallback.display.labelDarkTextColor,
				),
				labelDarkBackgroundColor: readColorString(
					display.labelDarkBackgroundColor,
					fallback.display.labelDarkBackgroundColor,
				),
				labelDarkBackgroundOpacity: clampNumber(
					readFiniteNumber(
						display.labelDarkBackgroundOpacity,
						fallback.display.labelDarkBackgroundOpacity,
					),
					0,
					1,
				),
				labelBackgroundOpacity: readFiniteNumber(
					display.labelBackgroundOpacity,
					fallback.display.labelBackgroundOpacity,
			),
			labelDensity: clampNumber(
				readFiniteNumber(
					display.labelDensity,
					fallback.display.labelDensity,
				),
				0,
					1,
				),
				cubeFaceOpacity: clampNumber(
				readFiniteNumber(
					display.cubeFaceOpacity,
					fallback.display.cubeFaceOpacity,
				),
				0.05,
				1,
			),
			forceLabels: readBoolean(
				display.forceLabels,
				fallback.display.forceLabels,
			),
			enableForceLayout: readBoolean(
				display.enableForceLayout ?? display.enableNodeDragging,
				fallback.display.enableForceLayout,
			),
			showInspector: readBoolean(display.showInspector, true),
			showFilters: readBoolean(display.showFilters, true),
		},
		style: {
			nodeOverrides: normalizeNodeStyleOverrides(
				styleRecord.nodeOverrides,
				legacyNodeBase,
				globalStyle.defaultNodeStyle,
			),
			unresolvedNodeOverrides: normalizeUnresolvedNodeStyleOverrides(
				styleRecord.unresolvedNodeOverrides,
			),
			linkOverrides: normalizeLinkStyleOverrides(
				styleRecord.linkOverrides,
				legacyLinkBase,
				globalStyle.defaultLinkStyle,
			),
			plainLinkOverrides: normalizePlainLinkStyleOverrides(
				styleRecord.plainLinkOverrides,
			),
			unresolvedLinkOverrides: normalizeUnresolvedLinkStyleOverrides(
				styleRecord.unresolvedLinkOverrides,
			),
			nodeRules: normalizeNodeStyleRules(styleRecord.nodeRules),
			linkRules: normalizeLinkStyleRules(styleRecord.linkRules),
		},
	};
}

function normalizeChartSource(value: unknown): ChartSource {
	return value === 'curated' ? 'curated' : 'query';
}

function readColorString(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim()
		? value.trim()
		: fallback;
}

function createUniqueChartId(
	baseId: string,
	existingCharts: MetaGraphChart[],
): string {
	const existingIds = new Set(existingCharts.map((chart) => chart.id));
	let id = baseId;
	let index = 2;
	while (existingIds.has(id)) {
		id = `${baseId}-${index}`;
		index += 1;
	}
	return id;
}

function createUniqueChartName(
	baseName: string,
	existingCharts: MetaGraphChart[],
): string {
	const existingNames = new Set(existingCharts.map((chart) => chart.name));
	let name = baseName;
	let index = 2;
	while (existingNames.has(name)) {
		name = `${baseName} ${index}`;
		index += 1;
	}
	return name;
}

export function createChartId(type: ViewMode): string {
	return getDefaultChartId(type);
}

function getDefaultChartId(type: ViewMode): string {
	switch (type) {
		case 'graph':
			return 'knowledge-map';
		case 'graph-3d':
			return 'knowledge-map-3d';
		case 'cube':
			return 'cube-map';
		case 'free':
			return 'free-map';
		case 'flow':
			return 'learning-flow';
		case 'arc':
			return 'arc-diagram';
		case 'hierarchical-edge-bundling':
			return 'hierarchical-edge-bundling';
	}
}

function getDefaultChartName(type: ViewMode): string {
	switch (type) {
		case 'graph':
			return 'Knowledge map';
		case 'graph-3d':
			return '3D graph';
		case 'cube':
			return 'Cube graph';
		case 'free':
			return 'Free map';
		case 'flow':
			return 'Learning flow';
		case 'arc':
			return 'Arc diagram';
		case 'hierarchical-edge-bundling':
			return 'Hierarchical edge bundling';
	}
}

function readViewMode(value: unknown): ViewMode {
	return value === 'flow' ||
		value === 'graph-3d' ||
		value === 'cube' ||
		value === 'free' ||
		value === 'arc' ||
		value === 'hierarchical-edge-bundling'
		? value
		: 'graph';
}
