import type {
	ChartSource,
	CreateChartInput,
	MetaGraphChart,
	ViewMode,
	WorkspaceState,
} from '../../core/types';
import {
	createDefaultChart,
	createDefaultCuratedWorkspace,
} from '../meta-graph-model';
import { addCuratedFilePaths } from './curated-workspace';
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
			dock: {
				...state.dock,
				dockWidth: chart.presentation.dockWidth,
				curatedPanelWidth: chart.presentation.curatedPanelWidth,
				focusOnSelect: chart.presentation.focusOnSelect,
				templates: state.dock.templates.map((template) => ({
					...template,
					defaultGroupId:
						chart.templateOverrides[template.id]?.defaultGroupId,
				})),
			},
			connectionUndoCount: state.connectionUndoCount,
			connectionRedoCount: state.connectionRedoCount,
		},
		runQuery: true,
	};
}

export function addChartInState(
	state: WorkspaceState,
	input: CreateChartInput,
): WorkspaceChartStateResult {
	const defaultChart = createDefaultChart(
		input.type,
		state.query.maxNodes,
		state.fadeDistance,
		state.charts,
	);
	const chart: MetaGraphChart = {
		...defaultChart,
		name: input.name.trim() || defaultChart.name,
		source: input.source,
		layout:
			input.type === 'cube'
				? normalizeCubeLayout(
						defaultChart.layout,
						state.projection?.nodes.map((node) => node.id) ?? [],
					)
				: defaultChart.layout,
	};
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
	const nextState = duplicateActiveChartState(state);
	return setActiveChartTypeInState(nextState, type);
}

export function duplicateActiveChartAndSetSourceInState(
	state: WorkspaceState,
	source: ChartSource,
	curatedPaths: readonly string[] = [],
): WorkspaceChartStateResult {
	const nextState = duplicateActiveChartState(state);
	return setActiveChartSourceInState(nextState, source, curatedPaths);
}

export function duplicateActiveChartInState(
	state: WorkspaceState,
): WorkspaceChartStateResult {
	return {
		state: duplicateActiveChartState(state),
		runQuery: false,
	};
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
			: {
					...defaultChart.layout,
					...(activeChart.type !== 'cube' && activeChart.layout.manual
						? { manual: activeChart.layout.manual }
						: {}),
				};
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
	curatedPaths: readonly string[] = [],
): WorkspaceChartStateResult {
	const activeChart = getActiveChart(state);
	if (activeChart.source === source) {
		return { state, runQuery: false };
	}
	const curated = activeChart.curated ?? createDefaultCuratedWorkspace();
	const nextCurated =
		source === 'curated' && curatedPaths.length > 0
			? addCuratedFilePaths(curated, [...curatedPaths]).curated
			: curated;
	return {
		state: updateActiveChartState(state, {
			source,
			curated: nextCurated,
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

function duplicateActiveChartState(state: WorkspaceState): WorkspaceState {
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

function createUniqueValue(
	baseValue: string,
	existingValues: Set<string>,
): string {
	if (!existingValues.has(baseValue)) {
		return baseValue;
	}
	let index = 2;
	while (existingValues.has(`${baseValue} ${index}`)) {
		index += 1;
	}
	return `${baseValue} ${index}`;
}
