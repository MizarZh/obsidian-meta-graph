import type {
	CuratedWorkspaceConfig,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import {
	addCuratedFilesToState,
	clearCuratedFilesInState,
	removeCuratedFilesFromState,
	reorderCuratedFileInState,
	reorderCuratedFilesInState,
	setCuratedFilesHiddenInState,
	updateCuratedFilePathInState,
	updateCuratedWorkspaceInState,
} from '../state/curated-state';
import type { ReorderPlacement } from './dock-actions';

export interface WorkspaceCuratedActionResult {
	state: WorkspaceState;
	changed: boolean;
	runQuery: boolean;
}

export function addCuratedFileInState(
	state: WorkspaceState,
	path: NodeId,
	groupId?: string,
): WorkspaceCuratedActionResult {
	return addCuratedFilesActionInState(state, [path], groupId);
}

export function addCuratedFilesActionInState(
	state: WorkspaceState,
	paths: NodeId[],
	groupId?: string,
): WorkspaceCuratedActionResult {
	return withRunQuery(addCuratedFilesToState(state, paths, groupId), state);
}

export function removeCuratedFileInState(
	state: WorkspaceState,
	path: NodeId,
): WorkspaceCuratedActionResult {
	return removeCuratedFilesActionInState(state, [path]);
}

export function removeCuratedFilesActionInState(
	state: WorkspaceState,
	paths: NodeId[],
): WorkspaceCuratedActionResult {
	return withRunQuery(removeCuratedFilesFromState(state, paths), state);
}

export function setCuratedFilesHiddenActionInState(
	state: WorkspaceState,
	paths: NodeId[],
	hidden: boolean,
): WorkspaceCuratedActionResult {
	return withRunQuery(
		setCuratedFilesHiddenInState(state, paths, hidden),
		state,
	);
}

export function reorderCuratedFileActionInState(
	state: WorkspaceState,
	path: NodeId,
	targetPath: NodeId,
	placement: ReorderPlacement,
): WorkspaceCuratedActionResult {
	return withRunQuery(
		reorderCuratedFileInState(state, path, targetPath, placement),
		state,
	);
}

export function reorderCuratedFilesActionInState(
	state: WorkspaceState,
	orderedPaths: NodeId[],
): WorkspaceCuratedActionResult {
	return withRunQuery(reorderCuratedFilesInState(state, orderedPaths), state);
}

export function clearCuratedFilesActionInState(
	state: WorkspaceState,
): WorkspaceCuratedActionResult {
	return withRunQuery(clearCuratedFilesInState(state), state);
}

export function updateCuratedWorkspaceActionInState(
	state: WorkspaceState,
	patch: Partial<CuratedWorkspaceConfig>,
): WorkspaceCuratedActionResult {
	return withRunQuery(updateCuratedWorkspaceInState(state, patch), state);
}

export function updateCuratedFilePathActionInState(
	state: WorkspaceState,
	oldPath: string,
	newPath: string,
): WorkspaceCuratedActionResult {
	const result = updateCuratedFilePathInState(state, oldPath, newPath);
	return {
		state: result.state,
		changed: result.changed,
		runQuery: false,
	};
}

function withRunQuery(
	nextState: WorkspaceState,
	previousState: WorkspaceState,
): WorkspaceCuratedActionResult {
	return {
		state: nextState,
		changed: nextState !== previousState,
		runQuery: true,
	};
}
