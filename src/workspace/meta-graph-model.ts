import type {
	ChartLayoutConfig,
	GraphQuery,
	LinkStyleRule,
	MetaGraphChart,
	MetaGraphDocument,
	NodeStyleRule,
	ViewMode,
} from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import { cloneSerializable } from './workspace-persistence';

export const META_GRAPH_FRONTMATTER_KEY = 'meta-graph';
export const META_GRAPH_FRONTMATTER_VALUE = 'workspace';
export const META_GRAPH_VERSION_KEY = 'meta-graph-version';
export const META_GRAPH_VERSION = 1;

export function normalizeMetaGraphDocument(
	value: unknown,
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const record = isRecord(value) ? value : {};
	const rawCharts = Array.isArray(record.charts) ? record.charts : [];
	const charts =
		rawCharts.length > 0
			? rawCharts.map((chart, index) =>
					normalizeChart(chart, index, maxNodes, fadeDistance),
				)
			: createDefaultCharts(maxNodes, fadeDistance);
	const activeChart =
		typeof record.activeChart === 'string' &&
		charts.some((chart) => chart.id === record.activeChart)
			? record.activeChart
			: (charts[0]?.id ?? createChartId('graph'));
	return { charts, activeChart };
}

export function createDefaultMetaGraphDocument(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const charts = createDefaultCharts(maxNodes, fadeDistance);
	return {
		charts,
		activeChart: charts[0]?.id ?? 'knowledge-map',
	};
}

export function createDefaultChart(
	type: ViewMode,
	maxNodes: number,
	fadeDistance: number,
	existingCharts: MetaGraphChart[] = [],
): MetaGraphChart {
	const baseId = type === 'graph' ? 'knowledge-map' : 'learning-flow';
	const id = createUniqueChartId(baseId, existingCharts);
	const name =
		type === 'graph'
			? createUniqueChartName('Knowledge map', existingCharts)
			: createUniqueChartName('Learning flow', existingCharts);
	return {
		id,
		name,
		type,
		query: createDefaultQuery(maxNodes, type),
		layout: createDefaultLayout(type),
		display: {
			fadeDistance,
			showInspector: true,
			showFilters: true,
		},
		style: {
			nodeRules: [],
			linkRules: [],
		},
	};
}

export function serializeMetaGraphState(state: {
	charts: MetaGraphChart[];
	activeChartId: string;
}): MetaGraphDocument {
	return cloneSerializable({
		charts: state.charts,
		activeChart: state.activeChartId,
	});
}

function createDefaultCharts(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphChart[] {
	const graph = createDefaultChart('graph', maxNodes, fadeDistance);
	const flow = createDefaultChart('flow', maxNodes, fadeDistance, [graph]);
	return [graph, flow];
}

function normalizeChart(
	value: unknown,
	index: number,
	maxNodes: number,
	fadeDistance: number,
): MetaGraphChart {
	const record = isRecord(value) ? value : {};
	const type = record.type === 'flow' ? 'flow' : 'graph';
	const fallback = createDefaultChart(type, maxNodes, fadeDistance);
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: `${fallback.id}-${index + 1}`;
	return {
		id,
		name:
			typeof record.name === 'string' && record.name.trim()
				? record.name.trim()
				: fallback.name,
		type,
		query: normalizeQuery(record.query, fallback.query, maxNodes),
		layout: normalizeLayout(record.layout, fallback.layout, type),
		display: {
			fadeDistance: readFiniteNumber(
				isRecord(record.display)
					? record.display.fadeDistance
					: undefined,
				fallback.display.fadeDistance,
			),
			showInspector: readBoolean(
				isRecord(record.display)
					? record.display.showInspector
					: undefined,
				true,
			),
			showFilters: readBoolean(
				isRecord(record.display)
					? record.display.showFilters
					: undefined,
				true,
			),
		},
		style: {
			nodeRules: normalizeArray<NodeStyleRule>(
				isRecord(record.style) ? record.style.nodeRules : undefined,
			),
			linkRules: normalizeArray<LinkStyleRule>(
				isRecord(record.style) ? record.style.linkRules : undefined,
			),
		},
	};
}

function normalizeQuery(
	value: unknown,
	fallback: GraphQuery,
	maxNodes: number,
): GraphQuery {
	const record = isRecord(value) ? value : {};
	return {
		...fallback,
		...cloneSerializable(record),
		maxNodes: readFiniteNumber(record.maxNodes, maxNodes),
	};
}

function normalizeLayout(
	value: unknown,
	fallback: ChartLayoutConfig,
	type: ViewMode,
): ChartLayoutConfig {
	const record = isRecord(value) ? value : {};
	return {
		engine: type === 'flow' ? 'elk' : 'force-atlas',
		spacing: readFiniteNumber(record.spacing, fallback.spacing),
		direction:
			record.direction === 'RL' ||
			record.direction === 'TD' ||
			record.direction === 'DT'
				? record.direction
				: fallback.direction,
		edgeStyle:
			record.edgeStyle === 'straight' || record.edgeStyle === 'orthogonal'
				? record.edgeStyle
				: fallback.edgeStyle,
	};
}

function createDefaultQuery(maxNodes: number, type: ViewMode): GraphQuery {
	return {
		...DEFAULT_GRAPH_QUERY,
		relations:
			type === 'flow'
				? ['prerequisite', 'leads-to']
				: [...DEFAULT_GRAPH_QUERY.relations],
		maxNodes,
	};
}

function createDefaultLayout(type: ViewMode): ChartLayoutConfig {
	return type === 'flow'
		? {
				engine: 'elk',
				spacing: 1,
				direction: 'LR',
				edgeStyle: 'orthogonal',
			}
		: {
				engine: 'force-atlas',
				spacing: 1,
			};
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

function createChartId(type: ViewMode): string {
	return type === 'graph' ? 'knowledge-map' : 'learning-flow';
}

function normalizeArray<T>(value: unknown): T[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((item) => cloneSerializable(item) as T);
}

function readFiniteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
