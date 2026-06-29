import type {
	ConnectionFieldMode,
	ConnectionFieldSpec,
	DefaultLinkStyle,
	DefaultNodeStyle,
	GraphQuery,
	LinkStyleRule,
	MetaGraphChart,
	MetaGraphDocument,
	MetaGraphDock,
	NodeStyleRule,
} from '../../core/types';
import { cloneSerializable } from '../workspace-persistence';
import { createChartId, createDefaultCharts, normalizeChart } from './chart';
import {
	DEFAULT_CONNECTION_FIELD,
	DEFAULT_CONNECTION_FIELD_MODE,
	DEFAULT_CONNECTION_FIELDS,
	DEFAULT_DOCK,
} from './constants';
import {
	createConnectionFieldSpec,
	normalizeConnectionFieldModes,
	normalizeConnectionFields,
	normalizeConnectionFieldSpecs,
} from './connections';
import { normalizeDock } from './dock';
import { createDefaultGlobalQuery, normalizeQuery } from './query';
import {
	createDefaultGlobalStyle,
	normalizeGlobalStyle,
} from './style';
import { isRecord } from './utils';

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
		globalQuery: normalizeQuery(
			record.globalQuery,
			createDefaultGlobalQuery(maxNodes),
			maxNodes,
		),
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
