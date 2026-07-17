import type {
	DockTemplateNode,
	MetaGraphDock,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import { normalizePath } from '../../core/knowledge-index';
import {
	addDockNote,
	addDockTemplate,
	removeDockNote,
	removeDockTemplate,
	reorderDockNote,
	reorderDockNotes,
	reorderDockTemplate,
	reorderDockTemplates,
	setCuratedPanelWidth,
	setDockFocusOnSelect,
	setDockWidth,
	updateDockNotePath,
	updateDockTemplate,
	type ReorderPlacement,
} from '../state/dock-state';

export type { ReorderPlacement };

export interface WorkspaceDockUpdateResult {
	state: WorkspaceState;
	changed: boolean;
}

export function addDockTemplateInState(
	state: WorkspaceState,
	template: Omit<DockTemplateNode, 'id'> & { id?: string },
): WorkspaceState {
	const dock = addDockTemplate(state.dock, template);
	const previousIds = new Set(state.dock.templates.map((item) => item.id));
	const added = dock.templates.find((item) => !previousIds.has(item.id));
	return added
		? setActiveTemplateOverride(
				setDockInState(state, dock),
				added.id,
				added.defaultGroupId,
			)
		: state;
}

export function updateDockTemplateInState(
	state: WorkspaceState,
	templateId: string,
	patch: Omit<DockTemplateNode, 'id'>,
): WorkspaceState {
	return setActiveTemplateOverride(
		setDockInState(
			state,
			updateDockTemplate(state.dock, templateId, patch),
		),
		templateId,
		patch.defaultGroupId,
	);
}

export function removeDockTemplateInState(
	state: WorkspaceState,
	templateId: string,
): WorkspaceState {
	const nextState = setDockInState(
		state,
		removeDockTemplate(state.dock, templateId),
	);
	return {
		...nextState,
		charts: nextState.charts.map((chart) => {
			if (!chart.templateOverrides[templateId]) return chart;
			const templateOverrides = { ...chart.templateOverrides };
			delete templateOverrides[templateId];
			return { ...chart, templateOverrides };
		}),
	};
}

export function reorderDockTemplateInState(
	state: WorkspaceState,
	templateId: string,
	targetTemplateId: string,
	placement: ReorderPlacement,
): WorkspaceState {
	return setDockInState(
		state,
		reorderDockTemplate(
			state.dock,
			templateId,
			targetTemplateId,
			placement,
		),
	);
}

export function reorderDockTemplatesInState(
	state: WorkspaceState,
	orderedTemplateIds: string[],
): WorkspaceState {
	return setDockInState(
		state,
		reorderDockTemplates(state.dock, orderedTemplateIds),
	);
}

export function addDockNoteInState(
	state: WorkspaceState,
	path: NodeId,
): WorkspaceState {
	return setDockInState(state, addDockNote(state.dock, path));
}

export function addDockNotesInState(
	state: WorkspaceState,
	paths: NodeId[],
): WorkspaceState {
	return paths.reduce(
		(nextState, path) => addDockNoteInState(nextState, path),
		state,
	);
}

export function removeDockNoteInState(
	state: WorkspaceState,
	path: NodeId,
): WorkspaceState {
	return setDockInState(state, removeDockNote(state.dock, path));
}

export function reorderDockNoteInState(
	state: WorkspaceState,
	path: NodeId,
	targetPath: NodeId,
	placement: ReorderPlacement,
): WorkspaceState {
	return setDockInState(
		state,
		reorderDockNote(state.dock, path, targetPath, placement),
	);
}

export function reorderDockNotesInState(
	state: WorkspaceState,
	orderedPaths: NodeId[],
): WorkspaceState {
	return setDockInState(state, reorderDockNotes(state.dock, orderedPaths));
}

export function setDockWidthInState(
	state: WorkspaceState,
	dockWidth: number,
): WorkspaceState {
	return setActivePresentation(
		setDockInState(state, setDockWidth(state.dock, dockWidth)),
		{ dockWidth },
	);
}

export function setCuratedPanelWidthInState(
	state: WorkspaceState,
	curatedPanelWidth: number,
): WorkspaceState {
	return setActivePresentation(
		setDockInState(
			state,
			setCuratedPanelWidth(state.dock, curatedPanelWidth),
		),
		{ curatedPanelWidth },
	);
}

export function setDockFocusOnSelectInState(
	state: WorkspaceState,
	focusOnSelect: boolean,
): WorkspaceState {
	return setActivePresentation(
		setDockInState(state, setDockFocusOnSelect(state.dock, focusOnSelect)),
		{ focusOnSelect },
	);
}

export function updateDockNotePathInState(
	state: WorkspaceState,
	oldPath: string,
	newPath: string,
): WorkspaceDockUpdateResult {
	const normalizedOld = normalizePath(oldPath);
	const normalizedNew = normalizePath(newPath);
	if (normalizedOld === normalizedNew) {
		return { state, changed: false };
	}
	const dock = updateDockNotePath(state.dock, normalizedOld, normalizedNew);
	return dock === state.dock
		? { state, changed: false }
		: { state: setDockInState(state, dock), changed: true };
}

function setDockInState(
	state: WorkspaceState,
	dock: MetaGraphDock,
): WorkspaceState {
	return dock === state.dock ? state : { ...state, dock };
}

function setActivePresentation(
	state: WorkspaceState,
	patch: Partial<WorkspaceState['charts'][number]['presentation']>,
): WorkspaceState {
	const activeChart = state.charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	if (
		!activeChart ||
		Object.entries(patch).every(
			([key, value]) =>
				activeChart.presentation[
					key as keyof typeof activeChart.presentation
				] === value,
		)
	) {
		return state;
	}
	return {
		...state,
		charts: state.charts.map((chart) =>
			chart.id === state.activeChartId
				? {
						...chart,
						presentation: { ...chart.presentation, ...patch },
					}
				: chart,
		),
	};
}

function setActiveTemplateOverride(
	state: WorkspaceState,
	templateId: string,
	defaultGroupId?: string,
): WorkspaceState {
	const activeChart = state.charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	if (
		!activeChart ||
		(!defaultGroupId && !activeChart.templateOverrides[templateId]) ||
		activeChart.templateOverrides[templateId]?.defaultGroupId ===
			defaultGroupId
	) {
		return state;
	}
	return {
		...state,
		charts: state.charts.map((chart) => {
			if (chart.id !== state.activeChartId) return chart;
			const templateOverrides = { ...chart.templateOverrides };
			if (defaultGroupId) {
				templateOverrides[templateId] = { defaultGroupId };
			} else {
				delete templateOverrides[templateId];
			}
			return { ...chart, templateOverrides };
		}),
	};
}
