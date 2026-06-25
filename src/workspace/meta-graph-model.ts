import type {
	ChartLayoutConfig,
	DockConnectionDirection,
	DockNoteNode,
	DockTemplateNode,
	GraphQuery,
	GlobalStyleConfig,
	LabelPosition,
	LinkStyleRule,
	MetaGraphChart,
	MetaGraphDocument,
	MetaGraphDock,
	NodeStyleRule,
	ViewMode,
} from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import { cloneSerializable } from './workspace-persistence';

export const META_GRAPH_FRONTMATTER_KEY = 'meta-graph';
export const META_GRAPH_FRONTMATTER_VALUE = 'workspace';
export const META_GRAPH_VERSION_KEY = 'meta-graph-version';
export const META_GRAPH_VERSION = 1;
export const BASE_STYLE_RULE_ID = 'all';
export const DEFAULT_CONNECTION_FIELD = 'leads-to';
export const DEFAULT_CONNECTION_FIELDS = [DEFAULT_CONNECTION_FIELD];
export const DEFAULT_LABEL_SIZE = 14;
export const DEFAULT_LABEL_POSITION: LabelPosition = 'right';
export const DEFAULT_DOCK: MetaGraphDock = {
	templates: [],
	notes: [],
	dockWidth: 280,
	focusOnSelect: true,
};

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
	const connectionFields = normalizeConnectionFields(record.connectionFields);
	const activeConnectionField =
		typeof record.activeConnectionField === 'string'
			? record.activeConnectionField.trim()
			: (connectionFields[0] ?? '');
	return {
		globalQuery: normalizeQuery(record.globalQuery, createDefaultGlobalQuery(maxNodes), maxNodes),
		globalStyle: normalizeGlobalStyle(record.globalStyle),
		charts,
		activeChart,
		connectionFields,
		activeConnectionField,
		dock: normalizeDock(record.dock),
	};
}

export function createDefaultMetaGraphDocument(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const charts = createDefaultCharts(maxNodes, fadeDistance);
	return {
		globalQuery: createDefaultGlobalQuery(maxNodes),
		globalStyle: createDefaultGlobalStyle(),
		charts,
		activeChart: charts[0]?.id ?? 'knowledge-map',
		connectionFields: [...DEFAULT_CONNECTION_FIELDS],
		activeConnectionField: DEFAULT_CONNECTION_FIELD,
		dock: cloneSerializable(DEFAULT_DOCK),
	};
}

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
		query: createDefaultQuery(maxNodes, type),
		layout: createDefaultLayout(type),
			display: {
				fadeDistance,
				labelSize: DEFAULT_LABEL_SIZE,
				labelPosition: DEFAULT_LABEL_POSITION,
				showInspector: true,
				showFilters: true,
			},
		style: {
			nodeRules: [createDefaultNodeStyleRule()],
			linkRules: [createDefaultLinkStyleRule()],
		},
	};
}

export function serializeMetaGraphState(state: {
	globalQuery: GraphQuery;
	globalNodeStyleRules: NodeStyleRule[];
	globalLinkStyleRules: LinkStyleRule[];
	charts: MetaGraphChart[];
	activeChartId: string;
	connectionFields: string[];
	activeConnectionField: string;
	dock: MetaGraphDock;
}): MetaGraphDocument {
	return cloneSerializable({
		globalQuery: state.globalQuery,
		globalStyle: {
			nodeRules: state.globalNodeStyleRules,
			linkRules: state.globalLinkStyleRules,
		},
		charts: state.charts,
		activeChart: state.activeChartId,
		connectionFields: state.connectionFields,
		activeConnectionField: state.activeConnectionField,
		dock: state.dock,
	});
}

export function normalizeConnectionFields(value: unknown): string[] {
	const fields = Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
	return uniqueStrings(fields);
}

export function normalizeDock(value: unknown): MetaGraphDock {
	const record = isRecord(value) ? value : {};
	return {
		templates: normalizeDockTemplates(record.templates),
		notes: normalizeDockNotes(record.notes),
		dockWidth: readFiniteNumber(record.dockWidth, 280),
		focusOnSelect: record.focusOnSelect !== false,
	};
}

export function normalizeDockTemplates(value: unknown): DockTemplateNode[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueById(
		records
			.map((item, index) => normalizeDockTemplate(item, index))
			.filter((item): item is DockTemplateNode => item !== undefined),
	);
}

export function normalizeDockNotes(value: unknown): DockNoteNode[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueByPath(
		records
			.map((item, index) => normalizeDockNote(item, index))
			.filter((item): item is DockNoteNode => item !== undefined),
	);
}

function createDefaultCharts(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphChart[] {
	const graph = createDefaultChart('graph', maxNodes, fadeDistance);
	const flow = createDefaultChart('flow', maxNodes, fadeDistance, [graph]);
	const arc = createDefaultChart('arc', maxNodes, fadeDistance, [graph, flow]);
	return [graph, flow, arc];
}

function normalizeChart(
	value: unknown,
	index: number,
	maxNodes: number,
	fadeDistance: number,
): MetaGraphChart {
	const record = isRecord(value) ? value : {};
	const type =
		record.type === 'flow' || record.type === 'arc' ? record.type : 'graph';
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
				labelSize: readFiniteNumber(
					isRecord(record.display) ? record.display.labelSize : undefined,
					fallback.display.labelSize,
				),
				labelPosition: readLabelPosition(
					isRecord(record.display) ? record.display.labelPosition : undefined,
					fallback.display.labelPosition,
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
			nodeRules: normalizeNodeStyleRules(
				isRecord(record.style) ? record.style.nodeRules : undefined,
			),
			linkRules: normalizeLinkStyleRules(
				isRecord(record.style) ? record.style.linkRules : undefined,
			),
		},
	};
}

export function createDefaultNodeStyleRule(): NodeStyleRule {
	return {
		id: BASE_STYLE_RULE_ID,
		field: 'all',
		value: '',
		color: '#7c6ff0',
		size: 7,
	};
}

export function createDefaultLinkStyleRule(): LinkStyleRule {
	return {
		id: BASE_STYLE_RULE_ID,
		field: 'all',
		value: '',
		color: '#888888',
		size: 1.5,
		lineStyle: 'solid',
		label: '',
		showLabel: false,
		hidden: false,
	};
}

export function normalizeNodeStyleRules(value: unknown): NodeStyleRule[] {
	const allRules = normalizeArray<NodeStyleRule>(value);
	const base = allRules.find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
	const rules = allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
	return [
		{
			...createDefaultNodeStyleRule(),
			...base,
			id: BASE_STYLE_RULE_ID,
			field: 'all',
			value: '',
		},
		...rules,
	];
}

export function normalizeLinkStyleRules(value: unknown): LinkStyleRule[] {
	const allRules = normalizeArray<LinkStyleRule>(value);
	const base = allRules.find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
	const rules = allRules.filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID && rule.field !== 'all',
	);
	return [
		{
			...createDefaultLinkStyleRule(),
			...base,
			id: BASE_STYLE_RULE_ID,
			field: 'all',
			value: '',
		},
		...rules,
	];
}

export function normalizeGlobalNodeStyleRules(value: unknown): NodeStyleRule[] {
	return normalizeArray<NodeStyleRule>(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID,
	);
}

export function normalizeGlobalLinkStyleRules(value: unknown): LinkStyleRule[] {
	return normalizeArray<LinkStyleRule>(value).filter(
		(rule) => rule.id !== BASE_STYLE_RULE_ID,
	);
}

function normalizeGlobalStyle(value: unknown): GlobalStyleConfig {
	const record = isRecord(value) ? value : {};
	return {
		nodeRules: normalizeGlobalNodeStyleRules(record.nodeRules),
		linkRules: normalizeGlobalLinkStyleRules(record.linkRules),
	};
}

function createDefaultGlobalStyle(): GlobalStyleConfig {
	return {
		nodeRules: [],
		linkRules: [],
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
		engine:
			type === 'flow' ? 'elk' : type === 'arc' ? 'arc' : 'force-atlas',
		spacing: readFiniteNumber(record.spacing, fallback.spacing),
		direction:
			record.direction === 'RL' ||
			record.direction === 'TD' ||
			record.direction === 'DT'
				? record.direction
				: fallback.direction,
		arcDirection:
			record.arcDirection === 'right' ||
			record.arcDirection === 'left' ||
			record.arcDirection === 'up' ||
			record.arcDirection === 'down'
				? record.arcDirection
				: fallback.arcDirection,
		edgeStyle:
			record.edgeStyle === 'straight' || record.edgeStyle === 'orthogonal'
				? record.edgeStyle
				: fallback.edgeStyle,
	};
}

function normalizeDockTemplate(
	value: unknown,
	index: number,
): DockTemplateNode | undefined {
	const record = isRecord(value) ? value : {};
	const label =
		typeof record.label === 'string' && record.label.trim()
			? record.label.trim()
			: undefined;
	if (!label) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('template', `${label}-${index}`);
	const direction = normalizeDockDirection(record.direction);
	return {
		id,
		label,
		templatePath:
			typeof record.templatePath === 'string'
				? normalizeTextPath(record.templatePath)
				: '',
		targetFolder:
			typeof record.targetFolder === 'string'
				? normalizeTextPath(record.targetFolder).replace(/\/$/u, '')
				: '',
		relationField:
			typeof record.relationField === 'string' && record.relationField.trim()
				? record.relationField.trim()
				: DEFAULT_CONNECTION_FIELD,
		direction,
	};
}

function normalizeDockNote(
	value: unknown,
	index: number,
): DockNoteNode | undefined {
	const record = isRecord(value) ? value : {};
	const path =
		typeof record.path === 'string' && record.path.trim()
			? normalizeTextPath(record.path)
			: undefined;
	if (!path) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('note', `${path}-${index}`);
	return { id, path };
}

function normalizeDockDirection(value: unknown): DockConnectionDirection {
	return value === 'from-dock-to-graph'
		? 'from-dock-to-graph'
		: 'from-graph-to-dock';
}

function normalizeTextPath(value: string): string {
	return value.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
}

function createDockId(prefix: string, value: string): string {
	const slug = value
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `${prefix}-${slug || Date.now().toString(36)}`;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of items) {
		if (seen.has(item.id)) {
			continue;
		}
		seen.add(item.id);
		result.push(item);
	}
	return result;
}

function uniqueByPath<T extends { path: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of items) {
		if (seen.has(item.path)) {
			continue;
		}
		seen.add(item.path);
		result.push(item);
	}
	return result;
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

function createDefaultGlobalQuery(maxNodes: number): GraphQuery {
	return {
		...DEFAULT_GRAPH_QUERY,
		roots: [],
		folders: [],
		tags: [],
		hiddenNodeRules: [],
		domains: [],
		relations: [],
		maxNodes,
	};
}

function createDefaultLayout(type: ViewMode): ChartLayoutConfig {
	switch (type) {
		case 'flow':
			return {
				engine: 'elk',
				spacing: 1,
				direction: 'LR',
				edgeStyle: 'orthogonal',
			};
		case 'arc':
			return {
				engine: 'arc',
				spacing: 1,
				arcDirection: 'right',
			};
		case 'graph':
			return {
				engine: 'force-atlas',
				spacing: 1,
			};
	}
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
	return getDefaultChartId(type);
}

function getDefaultChartId(type: ViewMode): string {
	switch (type) {
		case 'graph':
			return 'knowledge-map';
		case 'flow':
			return 'learning-flow';
		case 'arc':
			return 'arc-diagram';
	}
}

function getDefaultChartName(type: ViewMode): string {
	switch (type) {
		case 'graph':
			return 'Knowledge map';
		case 'flow':
			return 'Learning flow';
		case 'arc':
			return 'Arc diagram';
	}
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

function readLabelPosition(
	value: unknown,
	fallback: LabelPosition,
): LabelPosition {
	return value === 'right' ||
		value === 'left' ||
		value === 'top' ||
		value === 'bottom'
		? value
		: fallback;
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
