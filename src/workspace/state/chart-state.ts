import type {
	ChartSource,
	MetaGraphChart,
	ViewMode,
	WorkspaceState,
} from '../../core/types';
import {
	createDefaultChart,
	createDefaultCuratedWorkspace,
} from '../meta-graph-model';
import { normalizeCubeLayout } from './manual-layout';
import { cloneSerializable } from './persistence';
import { createWorkspaceState } from './workspace-state';
import { updateActiveChartState } from './state-updaters';

export interface WorkspaceChartStateResult {
	state: WorkspaceState;
	runQuery: boolean;
}

export function setActiveChartInState(
	state: WorkspaceState,
	activeChartId: string,
): WorkspaceChartStateResult {
	const chart = state.charts.find((item) => item.id === activeChartId);
	if (!chart || chart.id === state.activeChartId) {
		return { state, runQuery: false };
	}
	const nextState = createWorkspaceState(
		state.query.maxNodes,
		chart.display.fadeDistance,
		{
			charts: state.charts,
			globalQuery: state.globalQuery,
			globalStyle: {
				defaultNodeStyle: state.defaultNodeStyle,
				defaultLinkStyle: state.defaultLinkStyle,
				nodeRules: state.globalNodeStyleRules,
				linkRules: state.globalLinkStyleRules,
			},
			activeChart: chart.id,
			connectionFields: state.connectionFields,
			connectionFieldSpecs: state.connectionFieldSpecs,
			connectionFieldModes: state.connectionFieldModes,
			activeConnectionFieldSpecId: state.activeConnectionFieldSpecId,
			activeConnectionField: state.activeConnectionField,
			dock: state.dock,
		},
	);
	return {
		state: {
			...nextState,
			currentNoteId: state.currentNoteId,
			layoutRevision: state.layoutRevision + 1,
			availableFolders: state.availableFolders,
			availableTags: state.availableTags,
			availableDomains: state.availableDomains,
			globalQuery: state.globalQuery,
			globalNodeStyleRules: state.globalNodeStyleRules,
			globalLinkStyleRules: state.globalLinkStyleRules,
			connectionFields: state.connectionFields,
			connectionFieldSpecs: state.connectionFieldSpecs,
			connectionFieldModes: state.connectionFieldModes,
			activeConnectionFieldSpecId: state.activeConnectionFieldSpecId,
			activeConnectionField: state.activeConnectionField,
			dock: state.dock,
			connectionUndoCount: state.connectionUndoCount,
		},
		runQuery: true,
	};
}

export function addChartInState(
	state: WorkspaceState,
): WorkspaceChartStateResult {
	const chart = createDefaultChart(
		'graph',
		state.query.maxNodes,
		state.fadeDistance,
		state.charts,
	);
	return setActiveChartInState(
		{
			...state,
			charts: [...state.charts, chart],
		},
		chart.id,
	);
}

export function duplicateActiveChartAndSetTypeInState(
	state: WorkspaceState,
	type: ViewMode,
): WorkspaceChartStateResult {
	const nextState = duplicateActiveChartInState(state);
	return setActiveChartTypeInState(nextState, type);
}

export function duplicateActiveChartAndSetSourceInState(
	state: WorkspaceState,
	source: ChartSource,
): WorkspaceChartStateResult {
	const nextState = duplicateActiveChartInState(state);
	return setActiveChartSourceInState(nextState, source);
}

export function setActiveChartNameInState(
	state: WorkspaceState,
	name: string,
): WorkspaceChartStateResult {
	const normalized = name.trim();
	if (!normalized) {
		return { state, runQuery: false };
	}
	return {
		state: updateActiveChartState(state, { name: normalized }),
		runQuery: false,
	};
}

export function setActiveChartTypeInState(
	state: WorkspaceState,
	type: ViewMode,
): WorkspaceChartStateResult {
	const activeChart = getActiveChart(state);
	if (activeChart.type === type) {
		return { state, runQuery: false };
	}
	const defaultChart = createDefaultChart(
		type,
		state.query.maxNodes,
		state.fadeDistance,
		state.charts.filter((chart) => chart.id !== activeChart.id),
	);
	const layout =
		type === 'cube'
			? normalizeCubeLayout(
					defaultChart.layout,
					state.projection?.nodes.map((node) => node.id) ?? [],
				)
			: defaultChart.layout;
	return {
		state: updateActiveChartState(
			state,
			{
				type,
				layout,
			},
			true,
		),
		runQuery: true,
	};
}

export function setActiveChartSourceInState(
	state: WorkspaceState,
	source: ChartSource,
): WorkspaceChartStateResult {
	const activeChart = getActiveChart(state);
	if (activeChart.source === source) {
		return { state, runQuery: false };
	}
	return {
		state: updateActiveChartState(state, {
			source,
			curated: activeChart.curated ?? createDefaultCuratedWorkspace(),
		}),
		runQuery: true,
	};
}

export function deleteActiveChartInState(
	state: WorkspaceState,
): WorkspaceChartStateResult {
	if (state.charts.length <= 1) {
		return { state, runQuery: false };
	}
	const charts = state.charts.filter(
		(chart) => chart.id !== state.activeChartId,
	);
	const nextActiveChart = charts[0];
	if (!nextActiveChart) {
		return { state, runQuery: false };
	}
	return setActiveChartInState(
		{
			...state,
			charts,
		},
		nextActiveChart.id,
	);
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}

function duplicateActiveChartInState(state: WorkspaceState): WorkspaceState {
	const activeChart = getActiveChart(state);
	const duplicate = cloneSerializable({
		...activeChart,
		id: createUniqueChartId(`${activeChart.id}-copy`, state.charts),
		name: createUniqueChartName(`${activeChart.name} copy`, state.charts),
	});
	return {
		...state,
		charts: [...state.charts, duplicate],
		activeChartId: duplicate.id,
	};
}

function createUniqueChartId(
	baseId: string,
	existingCharts: MetaGraphChart[],
): string {
	return createUniqueValue(
		baseId,
		new Set(existingCharts.map((chart) => chart.id)),
	);
}

function createUniqueChartName(
	baseName: string,
	existingCharts: MetaGraphChart[],
): string {
	return createUniqueValue(
		baseName,
		new Set(existingCharts.map((chart) => chart.name)),
	);
}

function createUniqueValue(baseValue: string, existingValues: Set<string>): string {
	if (!existingValues.has(baseValue)) {
		return baseValue;
	}
	let index = 2;
	while (existingValues.has(`${baseValue} ${index}`)) {
		index += 1;
	}
	return `${baseValue} ${index}`;
}
