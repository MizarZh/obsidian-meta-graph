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
	return setDockInState(state, addDockTemplate(state.dock, template));
}

export function updateDockTemplateInState(
	state: WorkspaceState,
	templateId: string,
	patch: Omit<DockTemplateNode, 'id'>,
): WorkspaceState {
	return setDockInState(
		state,
		updateDockTemplate(state.dock, templateId, patch),
	);
}

export function removeDockTemplateInState(
	state: WorkspaceState,
	templateId: string,
): WorkspaceState {
	return setDockInState(state, removeDockTemplate(state.dock, templateId));
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
	return setDockInState(state, setDockWidth(state.dock, dockWidth));
}

export function setCuratedPanelWidthInState(
	state: WorkspaceState,
	curatedPanelWidth: number,
): WorkspaceState {
	return setDockInState(
		state,
		setCuratedPanelWidth(state.dock, curatedPanelWidth),
	);
}

export function setDockFocusOnSelectInState(
	state: WorkspaceState,
	focusOnSelect: boolean,
): WorkspaceState {
	return setDockInState(
		state,
		setDockFocusOnSelect(state.dock, focusOnSelect),
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
