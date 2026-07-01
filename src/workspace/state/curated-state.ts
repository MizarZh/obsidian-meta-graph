import { normalizePath } from '../../core/knowledge-index';
import type {
	CuratedWorkspaceConfig,
	MetaGraphChart,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import {
	addCuratedFilePaths,
	removeCuratedFilePaths,
	renameCuratedFilePath,
} from './curated-workspace';
import { normalizeCuratedWorkspace } from '../meta-graph-model';
import { cloneSerializable } from './persistence';
import { addManualPlacements, removeManualPlacements } from './manual-layout';
import { moveRelative, type ReorderPlacement } from './dock-state';
import { updateActiveChartState } from './state-updaters';

export interface WorkspaceCuratedUpdateResult {
	state: WorkspaceState;
	changed: boolean;
}

export function addCuratedFilesToState(
	state: WorkspaceState,
	paths: NodeId[],
	groupId?: string,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const update = addCuratedFilePaths(activeChart.curated, paths);
	if (!update.changed) {
		return state;
	}
	const layout = addManualPlacements(
		activeChart.layout,
		activeChart.curated.files.map((file) => file.path),
		update.curated.files.map((file) => file.path),
		groupId,
	);
	return updateActiveChartState(
		state,
		{ curated: update.curated, layout },
		true,
	);
}

export function removeCuratedFilesFromState(
	state: WorkspaceState,
	paths: NodeId[],
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const update = removeCuratedFilePaths(activeChart.curated, paths);
	if (!update.changed) {
		return state;
	}
	return updateActiveChartState(
		state,
		{
			curated: update.curated,
			layout: removeManualPlacements(activeChart.layout, paths),
		},
		true,
	);
}

export function setCuratedFilesHiddenInState(
	state: WorkspaceState,
	paths: NodeId[],
	hidden: boolean,
): WorkspaceState {
	const normalizedPaths = new Set(paths.map((path) => normalizePath(path)));
	if (normalizedPaths.size === 0) {
		return state;
	}
	const activeChart = getActiveChart(state);
	let changed = false;
	const files = activeChart.curated.files.map((file) => {
		if (
			!normalizedPaths.has(file.path) ||
			Boolean(file.hidden) === hidden
		) {
			return file;
		}
		changed = true;
		if (hidden) {
			return { ...file, hidden: true };
		}
		const { hidden: _hidden, ...visibleFile } = file;
		return visibleFile;
	});
	if (!changed) {
		return state;
	}
	return updateActiveChartState(
		state,
		{
			curated: normalizeCuratedWorkspace({
				...activeChart.curated,
				files,
			}),
		},
		true,
	);
}

export function reorderCuratedFileInState(
	state: WorkspaceState,
	path: NodeId,
	targetPath: NodeId,
	placement: ReorderPlacement,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const files = moveRelative(
		activeChart.curated.files,
		(file) => file.path === path,
		(file) => file.path === targetPath,
		placement,
	);
	if (files === activeChart.curated.files) {
		return state;
	}
	const curated = normalizeCuratedWorkspace({
		...activeChart.curated,
		files,
	});
	return updateActiveChartState(state, { curated });
}

export function clearCuratedFilesInState(
	state: WorkspaceState,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.curated.files.length === 0) {
		return state;
	}
	return updateActiveChartState(
		state,
		{
			curated: normalizeCuratedWorkspace({
				...activeChart.curated,
				files: [],
			}),
			layout: removeManualPlacements(
				activeChart.layout,
				activeChart.curated.files.map((file) => file.path),
			),
		},
		true,
	);
}

export function updateCuratedWorkspaceInState(
	state: WorkspaceState,
	patch: Partial<CuratedWorkspaceConfig>,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const curated = normalizeCuratedWorkspace({
		...activeChart.curated,
		...patch,
	});
	return updateActiveChartState(state, { curated }, true);
}

export function renameCuratedFilePathInState(
	state: WorkspaceState,
	oldPath: string,
	newPath: string,
): WorkspaceState {
	const normalizedOld = normalizePath(oldPath);
	const normalizedNew = normalizePath(newPath);
	if (normalizedOld === normalizedNew) {
		return state;
	}
	let changed = false;
	const charts = state.charts.map((chart) => {
		const update = renameCuratedFilePath(
			chart.curated,
			normalizedOld,
			normalizedNew,
		);
		changed ||= update.changed;
		return update.changed ? { ...chart, curated: update.curated } : chart;
	});
	if (!changed) {
		return state;
	}
	const activeChart = charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	return {
		...state,
		charts,
		curated: cloneSerializable(activeChart?.curated ?? state.curated),
	};
}

export function updateCuratedFilePathInState(
	state: WorkspaceState,
	oldPath: string,
	newPath: string,
): WorkspaceCuratedUpdateResult {
	const nextState = renameCuratedFilePathInState(state, oldPath, newPath);
	return nextState === state
		? { state, changed: false }
		: { state: nextState, changed: true };
}

export function pruneMissingCuratedFiles(
	charts: MetaGraphChart[],
	existingPaths: Set<string>,
): MetaGraphChart[] {
	let changed = false;
	const nextCharts = charts.map((chart) => {
		const missingPaths = chart.curated.files
			.map((file) => file.path)
			.filter((path) => !existingPaths.has(path));
		if (missingPaths.length === 0) {
			return chart;
		}
		const update = removeCuratedFilePaths(chart.curated, missingPaths);
		if (!update.changed) {
			return chart;
		}
		const layout = removeManualPlacements(chart.layout, missingPaths);
		changed = true;
		return { ...chart, curated: update.curated, layout };
	});
	return changed ? nextCharts : charts;
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}
