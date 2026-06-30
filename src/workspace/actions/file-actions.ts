import { normalizePath } from '../../core/knowledge-index';
import type { NodeId, WorkspaceState } from '../../core/types';

export interface WorkspaceNodeOpener<FileEntry> {
	getFile(path: NodeId): unknown;
	isFile(value: unknown): value is FileEntry;
	openFile(file: FileEntry): Promise<void>;
}

export function setCurrentFileInState(
	state: WorkspaceState,
	path: string | null | undefined,
): WorkspaceState {
	if (!path) {
		return state;
	}
	const currentNoteId = normalizePath(path);
	return currentNoteId === state.currentNoteId
		? state
		: { ...state, currentNoteId };
}

export function selectNodeInState(
	state: WorkspaceState,
	selectedNodeId?: NodeId,
): WorkspaceState {
	return state.selectedNodeId === selectedNodeId
		? state
		: { ...state, selectedNodeId };
}

export function hoverNodeInState(
	state: WorkspaceState,
	hoveredNodeId?: NodeId,
): WorkspaceState {
	return state.hoveredNodeId === hoveredNodeId
		? state
		: { ...state, hoveredNodeId };
}

export async function openWorkspaceNode<FileEntry>(
	nodeId: NodeId,
	opener: WorkspaceNodeOpener<FileEntry>,
): Promise<boolean> {
	const file = opener.getFile(nodeId);
	if (!opener.isFile(file)) {
		return false;
	}
	await opener.openFile(file);
	return true;
}
