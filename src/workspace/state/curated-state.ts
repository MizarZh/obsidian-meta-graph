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
	const existingPaths = new Set(
		activeChart.curated.files.map((file) => file.path),
	);
	const addedPaths = update.curated.files
		.map((file) => file.path)
		.filter((path) => !existingPaths.has(path));
	const grouping = assignCuratedGroup(activeChart, addedPaths, groupId);
	return updateActiveChartState(
		state,
		{ curated: update.curated, layout, grouping },
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
			grouping: removeGroupOverrides(activeChart, paths),
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
		const visibleFile = { ...file };
		delete visibleFile.hidden;
		return visibleFile;
	});
	if (!changed) {
		return state;
	}
	return updateActiveChartState(state, {
		curated: normalizeCuratedWorkspace({
			...activeChart.curated,
			files,
		}),
	});
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

export function reorderCuratedFilesInState(
	state: WorkspaceState,
	orderedPaths: NodeId[],
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const orderedPathSet = new Set(orderedPaths);
	if (orderedPathSet.size !== activeChart.curated.files.length) {
		return state;
	}
	const filesByPath = new Map(
		activeChart.curated.files.map((file) => [file.path, file]),
	);
	const files = orderedPaths.map((path) => filesByPath.get(path));
	if (files.some((file) => file === undefined)) {
		return state;
	}
	if (
		files.every((file, index) => file === activeChart.curated.files[index])
	) {
		return state;
	}
	const curated = normalizeCuratedWorkspace({
		...activeChart.curated,
		files: files as typeof activeChart.curated.files,
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
			grouping: removeGroupOverrides(
				activeChart,
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
		const grouping = renameGroupOverride(
			chart,
			normalizedOld,
			normalizedNew,
		);
		const chartChanged = update.changed || grouping !== chart.grouping;
		changed ||= chartChanged;
		return chartChanged
			? { ...chart, curated: update.curated, grouping }
			: chart;
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
		grouping: cloneSerializable(activeChart?.grouping ?? state.grouping),
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
		const update = removeCuratedFilePaths(chart.curated, missingPaths);
		const grouping = pruneGroupOverrides(chart, existingPaths);
		const chartChanged = update.changed || grouping !== chart.grouping;
		if (!chartChanged) {
			return chart;
		}
		changed = true;
		return {
			...chart,
			curated: update.curated,
			layout: update.changed
				? removeManualPlacements(chart.layout, missingPaths)
				: chart.layout,
			grouping,
		};
	});
	return changed ? nextCharts : charts;
}

function assignCuratedGroup(
	chart: MetaGraphChart,
	paths: readonly NodeId[],
	groupId?: string,
): MetaGraphChart['grouping'] {
	if (
		chart.type === 'cube' ||
		!groupId ||
		!chart.grouping.groups.some((group) => group.id === groupId)
	) {
		return chart.grouping;
	}
	const overrides = { ...chart.grouping.overrides };
	for (const path of paths) {
		overrides[path] = groupId;
	}
	return { ...chart.grouping, overrides };
}

function removeGroupOverrides(
	chart: MetaGraphChart,
	paths: readonly NodeId[],
): MetaGraphChart['grouping'] {
	if (chart.type === 'cube') {
		return chart.grouping;
	}
	const overrides = { ...chart.grouping.overrides };
	let changed = false;
	for (const path of paths) {
		if (Object.prototype.hasOwnProperty.call(overrides, path)) {
			delete overrides[path];
			changed = true;
		}
	}
	return changed ? { ...chart.grouping, overrides } : chart.grouping;
}

function renameGroupOverride(
	chart: MetaGraphChart,
	oldPath: NodeId,
	newPath: NodeId,
): MetaGraphChart['grouping'] {
	if (
		chart.type === 'cube' ||
		!Object.prototype.hasOwnProperty.call(chart.grouping.overrides, oldPath)
	) {
		return chart.grouping;
	}
	const overrides = { ...chart.grouping.overrides };
	overrides[newPath] = overrides[oldPath] ?? null;
	delete overrides[oldPath];
	return { ...chart.grouping, overrides };
}

function pruneGroupOverrides(
	chart: MetaGraphChart,
	existingPaths: ReadonlySet<NodeId>,
): MetaGraphChart['grouping'] {
	if (chart.type === 'cube') {
		return chart.grouping;
	}
	const overrides = Object.fromEntries(
		Object.entries(chart.grouping.overrides).filter(([path]) =>
			existingPaths.has(path),
		),
	);
	return Object.keys(overrides).length ===
		Object.keys(chart.grouping.overrides).length
		? chart.grouping
		: { ...chart.grouping, overrides };
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}
