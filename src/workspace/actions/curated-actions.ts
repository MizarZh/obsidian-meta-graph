import type {
	CuratedWorkspaceConfig,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import { normalizePath } from '../../core/knowledge-index';
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
	const nextState = setCuratedFilesHiddenInState(state, paths, hidden);
	if (nextState === state) {
		return { state, changed: false, runQuery: false };
	}
	if (nextState.chartSource !== 'curated' || !nextState.projection) {
		return { state: nextState, changed: true, runQuery: false };
	}
	const primaryIds =
		nextState.projection.primaryIds ?? nextState.projection.rootIds;
	const hiddenNodeIds = new Set(nextState.projection.hiddenNodeIds ?? []);
	for (const path of paths.map((item) => normalizePath(item))) {
		if (!primaryIds.has(path)) {
			continue;
		}
		if (hidden) {
			hiddenNodeIds.add(path);
		} else {
			hiddenNodeIds.delete(path);
		}
	}
	return {
		state: {
			...nextState,
			projection: {
				...nextState.projection,
				hiddenNodeIds,
			},
		},
		changed: true,
		runQuery: false,
	};
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
