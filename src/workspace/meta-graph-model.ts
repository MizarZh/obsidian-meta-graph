import type {
	ChartSource,
	ChartLayoutConfig,
	ConnectionFieldMode,
	ConnectionFieldSpec,
	CuratedWorkspaceConfig,
	CuratedWorkspaceContext,
	CuratedWorkspaceFile,
	DefaultLinkStyle,
	DefaultNodeStyle,
	DockConnectionDirection,
	DockNoteNode,
	DockTemplateNode,
	GraphQuery,
	GlobalStyleConfig,
	LabelPosition,
	LinkLineStyle,
	LinkStyleRule,
	ManualLayoutConfig,
	MetaGraphChart,
	MetaGraphDocument,
	MetaGraphDock,
	NodeFilterCondition,
	NodeFilterField,
	NodeFilterGroup,
	NodeFilterGroupMode,
	NodeFilterItem,
	NodeFilterOperator,
	NodeFilterRule,
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
export const DEFAULT_CONNECTION_FIELD_MODE: ConnectionFieldMode = 'directed';
export const DEFAULT_LABEL_SIZE = 14;
export const DEFAULT_GRAPH_CENTER_FORCE = 1;
export const DEFAULT_GRAPH_REPEL_FORCE = 10;
export const DEFAULT_GRAPH_LINK_FORCE = 1;
export const DEFAULT_GRAPH_DRAG_LINK_FORCE = 1;
export const DEFAULT_GRAPH_RETURN_FORCE = 1;
export const DEFAULT_GRAPH_LINK_DISTANCE = 250;
export const DEFAULT_LABEL_POSITION: LabelPosition = 'right';
export const DEFAULT_LABEL_COLOR = '';
export const DEFAULT_LABEL_BACKGROUND_OPACITY = 0.82;
export const DEFAULT_LABEL_DENSITY = 0.8;
export const DEFAULT_CUBE_FACE_OPACITY = 0.55;
export const DEFAULT_FORCE_LABELS = false;
export const BUILT_IN_DEFAULT_NODE_STYLE: Required<DefaultNodeStyle> = {
	color: '#7c6ff0',
	size: 7,
};
export const BUILT_IN_DEFAULT_LINK_STYLE: Required<DefaultLinkStyle> = {
	color: '#888888',
	size: 1.5,
	lineStyle: 'solid',
	label: '',
	showLabel: false,
	hidden: false,
};
export const DEFAULT_DOCK: MetaGraphDock = {
	templates: [],
	notes: [],
	dockWidth: 280,
	curatedPanelWidth: 300,
	focusOnSelect: true,
};
export const DEFAULT_CURATED_CONTEXT: CuratedWorkspaceContext = {
	enabled: false,
	depth: 0,
	includeOutgoingLinks: true,
	includeBacklinks: true,
	includeMetadataRelations: true,
};

export function normalizeMetaGraphDocument(
	value: unknown,
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const record = isRecord(value) ? value : {};
	const globalStyle = normalizeGlobalStyle(record.globalStyle);
	const rawCharts = Array.isArray(record.charts) ? record.charts : [];
	const charts =
		rawCharts.length > 0
			? rawCharts.map((chart, index) =>
					normalizeChart(chart, index, maxNodes, fadeDistance, globalStyle),
				)
			: createDefaultCharts(maxNodes, fadeDistance);
	const activeChart =
		typeof record.activeChart === 'string' &&
		charts.some((chart) => chart.id === record.activeChart)
			? record.activeChart
			: (charts[0]?.id ?? createChartId('graph'));
	const connectionFields = normalizeConnectionFields(record.connectionFields);
	const connectionFieldSpecs = normalizeConnectionFieldSpecs(
		record.connectionFieldSpecs,
		connectionFields,
		record.connectionFieldModes,
	);
	const connectionFieldModes = normalizeConnectionFieldModes(
		record.connectionFieldModes,
		connectionFields,
	);
	const activeConnectionField =
		typeof record.activeConnectionField === 'string'
			? record.activeConnectionField.trim()
			: (connectionFields[0] ?? '');
	const activeConnectionFieldSpecId =
		typeof record.activeConnectionFieldSpecId === 'string' &&
		connectionFieldSpecs.some(
			(spec) => spec.id === record.activeConnectionFieldSpecId,
		)
			? record.activeConnectionFieldSpecId
			: (connectionFieldSpecs.find((spec) => spec.field === activeConnectionField)
					?.id ??
				connectionFieldSpecs[0]?.id ??
				'');
	return {
		globalQuery: normalizeQuery(record.globalQuery, createDefaultGlobalQuery(maxNodes), maxNodes),
		globalStyle,
		charts,
		activeChart,
		connectionFields,
		connectionFieldSpecs,
		connectionFieldModes,
		activeConnectionFieldSpecId,
		activeConnectionField,
		dock: normalizeDock(record.dock),
	};
}

export function createDefaultMetaGraphDocument(
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const charts = createDefaultCharts(maxNodes, fadeDistance);
	const connectionFieldSpecs = DEFAULT_CONNECTION_FIELDS.map((field) =>
		createConnectionFieldSpec(field, DEFAULT_CONNECTION_FIELD_MODE),
	);
	return {
		globalQuery: createDefaultGlobalQuery(maxNodes),
		globalStyle: createDefaultGlobalStyle(),
		charts,
		activeChart: charts[0]?.id ?? 'knowledge-map',
		connectionFields: [...DEFAULT_CONNECTION_FIELDS],
		connectionFieldSpecs,
		connectionFieldModes: Object.fromEntries(
			DEFAULT_CONNECTION_FIELDS.map((field) => [
				field,
				DEFAULT_CONNECTION_FIELD_MODE,
			]),
		),
		activeConnectionFieldSpecId: connectionFieldSpecs[0]?.id ?? '',
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
		source: 'query',
		query: createDefaultQuery(maxNodes, type),
		curated: createDefaultCuratedWorkspace(),
		layout: createDefaultLayout(type),
			display: {
				fadeDistance,
				labelSize: DEFAULT_LABEL_SIZE,
				labelPosition: DEFAULT_LABEL_POSITION,
					labelColor: DEFAULT_LABEL_COLOR,
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
			linkOverrides: {},
			nodeRules: [],
			linkRules: [],
		},
	};
}

export function serializeMetaGraphState(state: {
	globalQuery: GraphQuery;
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	globalNodeStyleRules: NodeStyleRule[];
	globalLinkStyleRules: LinkStyleRule[];
	charts: MetaGraphChart[];
	activeChartId: string;
	connectionFields: string[];
	connectionFieldSpecs: ConnectionFieldSpec[];
	connectionFieldModes: Record<string, ConnectionFieldMode>;
	activeConnectionFieldSpecId: string;
	activeConnectionField: string;
	dock: MetaGraphDock;
}): MetaGraphDocument {
	return cloneSerializable({
		globalQuery: state.globalQuery,
		globalStyle: {
			defaultNodeStyle: state.defaultNodeStyle,
			defaultLinkStyle: state.defaultLinkStyle,
			nodeRules: state.globalNodeStyleRules,
			linkRules: state.globalLinkStyleRules,
		},
		charts: state.charts,
		activeChart: state.activeChartId,
		connectionFields: state.connectionFields,
		connectionFieldSpecs: state.connectionFieldSpecs,
		connectionFieldModes: state.connectionFieldModes,
		activeConnectionFieldSpecId: state.activeConnectionFieldSpecId,
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

export function normalizeConnectionFieldSpecs(
	value: unknown,
	legacyFields: string[] = [],
	legacyModes: unknown = {},
): ConnectionFieldSpec[] {
	const records = Array.isArray(value) ? value : [];
	const specs = records
		.map((item) => normalizeConnectionFieldSpec(item))
		.filter((item): item is ConnectionFieldSpec => item !== undefined);
	const fallbackSpecs = legacyFields.map((field) =>
		createConnectionFieldSpec(
			field,
			readConnectionFieldMode(isRecord(legacyModes) ? legacyModes[field] : undefined),
		),
	);
	return uniqueConnectionFieldSpecs(specs.length > 0 ? specs : fallbackSpecs);
}

export function normalizeConnectionFieldModes(
	value: unknown,
	fields: string[],
): Record<string, ConnectionFieldMode> {
	const record = isRecord(value) ? value : {};
	return Object.fromEntries(
		fields.map((field) => {
			const mode = readConnectionFieldMode(record[field]);
			return [field, mode];
		}),
	);
}

export function createConnectionFieldSpec(
	field: string,
	mode: ConnectionFieldMode,
): ConnectionFieldSpec {
	const normalized = field.trim();
	return {
		id: createConnectionFieldSpecId(normalized, mode),
		field: normalized,
		mode,
	};
}

export function normalizeDock(value: unknown): MetaGraphDock {
	const record = isRecord(value) ? value : {};
	return {
		templates: normalizeDockTemplates(record.templates),
		notes: normalizeDockNotes(record.notes),
		dockWidth: readFiniteNumber(record.dockWidth, 280),
		curatedPanelWidth: readFiniteNumber(record.curatedPanelWidth, 300),
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

function normalizeConnectionFieldSpec(
	value: unknown,
): ConnectionFieldSpec | undefined {
	const record = isRecord(value) ? value : {};
	const field = typeof record.field === 'string' ? record.field.trim() : '';
	if (!field) {
		return undefined;
	}
	const mode = readConnectionFieldMode(record.mode);
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createConnectionFieldSpecId(field, mode);
	return { id, field, mode };
}

function uniqueConnectionFieldSpecs(
	specs: ConnectionFieldSpec[],
): ConnectionFieldSpec[] {
	const seen = new Set<string>();
	const nextSpecs: ConnectionFieldSpec[] = [];
	for (const spec of specs) {
		const key = createConnectionFieldSpecId(spec.field, spec.mode);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		nextSpecs.push({
			...spec,
			id: spec.id || key,
		});
	}
	return nextSpecs;
}

function createConnectionFieldSpecId(
	field: string,
	mode: ConnectionFieldMode,
): string {
	return `${field}:${mode}`;
}

function readConnectionFieldMode(value: unknown): ConnectionFieldMode {
	return value === 'bidirectional' || value === 'reverse'
		? value
		: DEFAULT_CONNECTION_FIELD_MODE;
}

function normalizeChart(
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
		source,
		query: normalizeQuery(record.query, fallback.query, maxNodes),
		curated: normalizeCuratedWorkspace(record.curated ?? record.workspace),
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
				labelColor:
					isRecord(record.display) && typeof record.display.labelColor === 'string'
						? record.display.labelColor.trim()
						: fallback.display.labelColor,
					labelBackgroundOpacity: readFiniteNumber(
						isRecord(record.display)
							? record.display.labelBackgroundOpacity
							: undefined,
						fallback.display.labelBackgroundOpacity,
					),
						labelDensity: clampNumber(
							readFiniteNumber(
								isRecord(record.display)
									? record.display.labelDensity
									: undefined,
								fallback.display.labelDensity,
							),
							0,
							1,
						),
						cubeFaceOpacity: clampNumber(
							readFiniteNumber(
								isRecord(record.display)
									? record.display.cubeFaceOpacity
									: undefined,
								fallback.display.cubeFaceOpacity,
							),
							0.05,
							1,
						),
						forceLabels: readBoolean(
						isRecord(record.display) ? record.display.forceLabels : undefined,
						fallback.display.forceLabels,
					),
					enableForceLayout: readBoolean(
					isRecord(record.display)
						? (record.display.enableForceLayout ??
								record.display.enableNodeDragging)
						: undefined,
					fallback.display.enableForceLayout,
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
			nodeOverrides: normalizeNodeStyleOverrides(
				styleRecord.nodeOverrides,
				legacyNodeBase,
				globalStyle.defaultNodeStyle,
			),
			linkOverrides: normalizeLinkStyleOverrides(
				styleRecord.linkOverrides,
				legacyLinkBase,
				globalStyle.defaultLinkStyle,
			),
			nodeRules: normalizeNodeStyleRules(
				styleRecord.nodeRules,
			),
			linkRules: normalizeLinkStyleRules(
				styleRecord.linkRules,
			),
		},
	};
}

export function createDefaultCuratedWorkspace(): CuratedWorkspaceConfig {
	return {
		files: [],
		context: { ...DEFAULT_CURATED_CONTEXT },
	};
}

export function normalizeCuratedWorkspace(
	value: unknown,
): CuratedWorkspaceConfig {
	const record = isRecord(value) ? value : {};
	return {
		files: normalizeCuratedFiles(record.files),
		context: normalizeCuratedContext(record.context),
	};
}

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

function normalizeGlobalStyle(value: unknown): GlobalStyleConfig {
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

function createDefaultGlobalStyle(): GlobalStyleConfig {
	return {
		defaultNodeStyle: { ...BUILT_IN_DEFAULT_NODE_STYLE },
		defaultLinkStyle: { ...BUILT_IN_DEFAULT_LINK_STYLE },
		nodeRules: [],
		linkRules: [],
	};
}

function normalizeDefaultNodeStyle(
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

function normalizeDefaultLinkStyle(
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

function normalizeNodeStyleOverrides(
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

function normalizeLinkStyleOverrides(
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

function readBaseNodeStyleRule(value: unknown): NodeStyleRule | undefined {
	return normalizeArray<NodeStyleRule>(value).find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
}

function readBaseLinkStyleRule(value: unknown): LinkStyleRule | undefined {
	return normalizeArray<LinkStyleRule>(value).find(
		(rule) => rule.id === BASE_STYLE_RULE_ID || rule.field === 'all',
	);
}

function normalizeQuery(
	value: unknown,
	fallback: GraphQuery,
	maxNodes: number,
): GraphQuery {
	const record = isRecord(value) ? value : {};
	const hiddenNodeRules = normalizeFilterRules(record.hiddenNodeRules);
	const filterRoot = normalizeFilterRoot(record.filterRoot, hiddenNodeRules);
	return {
		...fallback,
		...cloneSerializable(record),
		hiddenNodeRules,
		filterRoot,
		maxNodes: readFiniteNumber(record.maxNodes, maxNodes),
	};
}

function normalizeFilterRoot(
	value: unknown,
	legacyRules: NodeFilterRule[],
): NodeFilterGroup {
	const normalized = normalizeFilterGroup(value, true);
	if (normalized) {
		return normalized;
	}
	return migrateLegacyFilterRules(legacyRules);
}

function normalizeFilterGroup(
	value: unknown,
	root = false,
): NodeFilterGroup | undefined {
	if (!isRecord(value) || value.kind !== 'group') {
		return undefined;
	}
	const id =
		root || typeof value.id !== 'string' || !value.id.trim()
			? 'root'
			: value.id.trim();
	const mode = readFilterGroupMode(value.mode);
	const children = Array.isArray(value.children)
		? value.children
				.map((child) => normalizeFilterItem(child))
				.filter((child): child is NodeFilterItem => child !== undefined)
		: [];
	return {
		id,
		kind: 'group',
		mode,
		children,
	};
}

function normalizeFilterItem(value: unknown): NodeFilterItem | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	if (value.kind === 'group') {
		return normalizeFilterGroup(value);
	}
	if (value.kind === 'condition') {
		return normalizeFilterCondition(value);
	}
	return undefined;
}

function normalizeFilterCondition(
	value: Record<string, unknown>,
): NodeFilterCondition | undefined {
	const field = readFilterField(value.field);
	if (!field) {
		return undefined;
	}
	return {
		id:
			typeof value.id === 'string' && value.id.trim()
				? value.id.trim()
				: createRuleId(),
		kind: 'condition',
		field,
		operator: readFilterOperator(value.operator),
		value: typeof value.value === 'string' ? value.value : '',
	};
}

function normalizeFilterRules(value: unknown): NodeFilterRule[] {
	return Array.isArray(value)
		? value
				.map((item) => normalizeFilterRule(item))
				.filter((item): item is NodeFilterRule => item !== undefined)
		: [];
}

function normalizeFilterRule(value: unknown): NodeFilterRule | undefined {
	const record = isRecord(value) ? value : {};
	const field = readFilterField(record.field);
	if (!field) {
		return undefined;
	}
	return {
		id:
			typeof record.id === 'string' && record.id.trim()
				? record.id.trim()
				: createRuleId(),
		action: record.action === 'hide' ? 'hide' : 'show',
		field,
		operator: readFilterOperator(record.operator),
		value: typeof record.value === 'string' ? record.value : '',
	};
}

function migrateLegacyFilterRules(rules: NodeFilterRule[]): NodeFilterGroup {
	const showRules = rules.filter((rule) => rule.action === 'show');
	const hideRules = rules.filter((rule) => rule.action === 'hide');
	const children: NodeFilterItem[] = [];
	if (showRules.length > 0) {
		children.push({
			id: createRuleId(),
			kind: 'group',
			mode: 'all',
			children: showRules.map(legacyRuleToCondition),
		});
	}
	if (hideRules.length > 0) {
		children.push({
			id: createRuleId(),
			kind: 'group',
			mode: 'none',
			children: hideRules.map(legacyRuleToCondition),
		});
	}
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children,
	};
}

function legacyRuleToCondition(rule: NodeFilterRule): NodeFilterCondition {
	return {
		id: rule.id,
		kind: 'condition',
		field: rule.field,
		operator: rule.operator,
		value: rule.value,
	};
}

function normalizeCuratedFiles(value: unknown): CuratedWorkspaceFile[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueByPath(
		records
			.map((item) => normalizeCuratedFile(item))
			.filter((item): item is CuratedWorkspaceFile => item !== undefined),
	);
}

function normalizeCuratedFile(
	value: unknown,
): CuratedWorkspaceFile | undefined {
	const record = isRecord(value) ? value : {};
	const rawPath =
		typeof record.path === 'string' && record.path.trim()
			? record.path
			: typeof value === 'string' && value.trim()
				? value
				: undefined;
	if (!rawPath) {
		return undefined;
	}
	const result: CuratedWorkspaceFile = {
		path: normalizeTextPath(rawPath),
	};
	if (typeof record.group === 'string' && record.group.trim()) {
		result.group = record.group.trim();
	}
	if (typeof record.note === 'string' && record.note.trim()) {
		result.note = record.note.trim();
	}
	if (typeof record.x === 'number' && Number.isFinite(record.x)) {
		result.x = record.x;
	}
	if (typeof record.y === 'number' && Number.isFinite(record.y)) {
		result.y = record.y;
	}
	return result;
}

function normalizeCuratedContext(value: unknown): CuratedWorkspaceContext {
	const record = isRecord(value) ? value : {};
	return {
		enabled: readBoolean(record.enabled, DEFAULT_CURATED_CONTEXT.enabled),
		depth: Math.max(
			0,
			Math.floor(readFiniteNumber(record.depth, DEFAULT_CURATED_CONTEXT.depth)),
		),
		includeOutgoingLinks: readBoolean(
			record.includeOutgoingLinks,
			DEFAULT_CURATED_CONTEXT.includeOutgoingLinks,
		),
		includeBacklinks: readBoolean(
			record.includeBacklinks,
			DEFAULT_CURATED_CONTEXT.includeBacklinks,
		),
		includeMetadataRelations: readBoolean(
			record.includeMetadataRelations,
			DEFAULT_CURATED_CONTEXT.includeMetadataRelations,
		),
	};
}

function normalizeChartSource(value: unknown): ChartSource {
	return value === 'curated' ? 'curated' : 'query';
}

function normalizeLayout(
	value: unknown,
	fallback: ChartLayoutConfig,
	type: ViewMode,
): ChartLayoutConfig {
	const record = isRecord(value) ? value : {};
		return {
			engine: readLayoutEngine(type),
			spacing: readFiniteNumber(record.spacing, fallback.spacing),
			centerForce: normalizeForceSetting(
				record.centerForce,
				fallback.centerForce ?? DEFAULT_GRAPH_CENTER_FORCE,
			),
			repelForce: normalizeForceSetting(
				record.repelForce,
				fallback.repelForce ?? DEFAULT_GRAPH_REPEL_FORCE,
			),
			linkForce: normalizeForceSetting(
				record.linkForce,
				fallback.linkForce ?? DEFAULT_GRAPH_LINK_FORCE,
			),
			dragLinkForce: normalizeForceSetting(
				record.dragLinkForce,
				fallback.dragLinkForce ?? DEFAULT_GRAPH_DRAG_LINK_FORCE,
			),
			returnForce: normalizeForceSetting(
				record.returnForce,
				fallback.returnForce ?? DEFAULT_GRAPH_RETURN_FORCE,
			),
			linkDistance: normalizeForceSetting(
				record.linkDistance,
				fallback.linkDistance ?? DEFAULT_GRAPH_LINK_DISTANCE,
			),
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
		manual: normalizeManualLayout(record.manual, fallback.manual),
	};
}

function normalizeForceSetting(value: unknown, fallback: number): number {
	const normalized = readFiniteNumber(value, fallback);
	return normalized >= 0 ? normalized : fallback;
}

function normalizeManualLayout(
	value: unknown,
	fallback?: ManualLayoutConfig,
): ManualLayoutConfig {
	const record = isRecord(value) ? value : {};
	const nodeRecord = isRecord(record.nodes) ? record.nodes : {};
	const nodes: ManualLayoutConfig['nodes'] = {};
	for (const [path, placementValue] of Object.entries(nodeRecord)) {
		const placement = normalizeNodePlacement(placementValue);
		if (placement) {
			nodes[normalizeTextPath(path)] = placement;
		}
	}
	const groups = Array.isArray(record.groups)
		? record.groups
				.map((group, index) => normalizeChartGroup(group, index))
				.filter((group): group is ManualLayoutConfig['groups'][number] =>
					Boolean(group),
				)
		: [];
	return {
		nodes:
			Object.keys(nodes).length > 0
				? nodes
				: cloneSerializable(fallback?.nodes ?? {}),
		groups: groups.length > 0 ? uniqueById(groups) : cloneSerializable(fallback?.groups ?? []),
	};
}

function normalizeNodePlacement(value: unknown): ManualLayoutConfig['nodes'][string] | undefined {
	const record = isRecord(value) ? value : {};
	const x = readOptionalFiniteNumber(record.x);
	const y = readOptionalFiniteNumber(record.y);
	if (x === undefined || y === undefined) {
		return undefined;
	}
	const groupId =
		typeof record.groupId === 'string' && record.groupId.trim()
			? record.groupId.trim()
			: undefined;
	return groupId ? { x, y, groupId } : { x, y };
}

function normalizeChartGroup(
	value: unknown,
	index: number,
): ManualLayoutConfig['groups'][number] | undefined {
	const record = isRecord(value) ? value : {};
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('group', `${index + 1}`);
	const name =
		typeof record.name === 'string' && record.name.trim()
			? record.name.trim()
			: `Group ${index + 1}`;
	const x = readFiniteNumber(record.x, 0);
	const y = readFiniteNumber(record.y, 0);
	const width = Math.max(0.8, normalizeGroupSize(record.width, 3.2));
	const height = Math.max(0.6, normalizeGroupSize(record.height, 2.2));
	const color =
		typeof record.color === 'string' && record.color.trim()
			? record.color.trim()
			: '#7c6ff0';
	const mode = record.mode === 'rule' ? 'rule' : 'manual';
	const padding = Math.max(0, readFiniteNumber(record.padding, 0.32));
	return {
		id,
		name,
		x,
		y,
		width,
		height,
		color,
		mode,
		padding,
		rule: isRecord(record.rule)
			? normalizeFilterGroup(record.rule)
			: undefined,
	};
}

function normalizeGroupSize(value: unknown, fallback: number): number {
	const size = readFiniteNumber(value, fallback);
	return size > 20 ? size / 100 : size;
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
		defaultGroupId:
			typeof record.defaultGroupId === 'string' && record.defaultGroupId.trim()
				? record.defaultGroupId.trim()
				: undefined,
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
		case 'hierarchical-edge-bundling':
			return {
				engine: 'hierarchical-edge-bundling',
				spacing: 1,
			};
		case 'graph-3d':
			return {
				engine: 'force-3d',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
			};
		case 'cube':
			return {
				engine: 'cube-3d',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
				manual: {
					nodes: {},
					groups: createDefaultCubeGroups(),
				},
			};
		case 'free':
			return {
				engine: 'free',
				spacing: 1,
				manual: {
					nodes: {},
					groups: [],
				},
			};
		case 'graph':
			return {
				engine: 'force-atlas',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
			};
	}
}

function createDefaultCubeGroups(): ManualLayoutConfig['groups'] {
	return [
		{ id: 'cube-front', name: 'Front', x: -1, y: -1, width: 2, height: 2, color: '#009b48', mode: 'manual', padding: 0.22 },
		{ id: 'cube-back', name: 'Back', x: -1, y: -1, width: 2, height: 2, color: '#0046ad', mode: 'manual', padding: 0.22 },
		{ id: 'cube-left', name: 'Left', x: -1, y: -1, width: 2, height: 2, color: '#ff5800', mode: 'manual', padding: 0.22 },
		{ id: 'cube-right', name: 'Right', x: -1, y: -1, width: 2, height: 2, color: '#b71234', mode: 'manual', padding: 0.22 },
		{ id: 'cube-top', name: 'Top', x: -1, y: -1, width: 2, height: 2, color: '#ffffff', mode: 'manual', padding: 0.22 },
		{ id: 'cube-bottom', name: 'Bottom', x: -1, y: -1, width: 2, height: 2, color: '#ffd500', mode: 'manual', padding: 0.22 },
	];
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

function readLayoutEngine(type: ViewMode): ChartLayoutConfig['engine'] {
	if (type === 'flow') {
		return 'elk';
	}
	if (type === 'arc') {
		return 'arc';
	}
	if (type === 'hierarchical-edge-bundling') {
		return 'hierarchical-edge-bundling';
	}
	if (type === 'graph-3d') {
		return 'force-3d';
	}
	if (type === 'cube') {
		return 'cube-3d';
	}
	if (type === 'free') {
		return 'free';
	}
	return 'force-atlas';
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

function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function readStyleColor(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalStyleColor(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStyleLabel(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function readOptionalStyleLabel(value: unknown): string | undefined {
	return typeof value === 'string' ? value.trim() : undefined;
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function readLinkLineStyle(value: unknown, fallback: LinkLineStyle): LinkLineStyle {
	const optional = readOptionalLinkLineStyle(value);
	return optional ?? fallback;
}

function readOptionalLinkLineStyle(value: unknown): LinkLineStyle | undefined {
	return value === 'solid' || value === 'dashed' || value === 'dotted'
		? value
		: undefined;
}

function readFilterField(value: unknown): NodeFilterField | undefined {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}
	const field = value.trim();
	if (field.startsWith('metadata.')) {
		return field as NodeFilterField;
	}
	return FILTER_FIELDS.has(field) ? (field as NodeFilterField) : undefined;
}

function readFilterOperator(value: unknown): NodeFilterOperator | undefined {
	return typeof value === 'string' && FILTER_OPERATORS.has(value)
		? (value as NodeFilterOperator)
		: undefined;
}

function readFilterGroupMode(value: unknown): NodeFilterGroupMode {
	return value === 'any' || value === 'none' ? value : 'all';
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

function createRuleId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const FILTER_FIELDS = new Set<string>([
	'file.file',
	'file.name',
	'file.basename',
	'file.fullname',
	'file.path',
	'file.folder',
	'file.ext',
	'file.ctime',
	'file.mtime',
	'file.size',
	'file.links',
	'file.embeds',
	'file.tags',
	'aliases',
	'metadata-field',
	'folder',
	'tag',
]);

const FILTER_OPERATORS = new Set<string>([
	'has-value',
	'empty',
	'is',
	'is-not',
	'contains',
	'does-not-contain',
	'links-to',
	'in-folder',
	'has-tag',
	'has-property',
	'does-not-link-to',
	'is-not-in-folder',
	'does-not-have-tag',
	'does-not-have-property',
	'starts-with',
	'ends-with',
	'is-empty',
	'is-not-empty',
	'contains-any-of',
	'contains-all-of',
	'does-not-start-with',
	'does-not-end-with',
	'does-not-contain-any-of',
	'does-not-contain-all-of',
	'on',
	'not-on',
	'before',
	'on-or-before',
	'after',
	'on-or-after',
	'eq',
	'neq',
	'lt',
	'lte',
	'gt',
	'gte',
	'is-exactly',
	'is-not-exactly',
]);
