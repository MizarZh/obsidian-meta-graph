import { describe, expect, it, vi } from 'vitest';
import {
	hoverNodeInState,
	openWorkspaceNode,
	selectNodeInState,
	setCurrentFileInState,
} from '../workspace/actions/file-actions';
import { createWorkspaceState } from '../workspace/state/workspace-state';

interface TestFile {
	path: string;
}

describe('workspace file actions', () => {
	it('sets current file paths and keeps no-ops stable', () => {
		const state = createWorkspaceState(100);
		const nextState = setCurrentFileInState(state, 'Folder/Note.md');

		expect(nextState.currentNoteId).toBe('Folder/Note.md');
		expect(setCurrentFileInState(nextState, 'Folder/Note.md')).toBe(nextState);
		expect(setCurrentFileInState(nextState, null)).toBe(nextState);
	});

	it('sets selected and hovered node ids', () => {
		const state = createWorkspaceState(100);
		const selected = selectNodeInState(state, 'A.md');
		const hovered = hoverNodeInState(selected, 'B.md');

		expect(selected.selectedNodeId).toBe('A.md');
		expect(selectNodeInState(selected, 'A.md')).toBe(selected);
		expect(hovered.hoveredNodeId).toBe('B.md');
		expect(hoverNodeInState(hovered, 'B.md')).toBe(hovered);
	});

	it('opens existing files through the provided opener', async () => {
		const file = { path: 'A.md' };
		const openFile = vi.fn();

		await expect(
			openWorkspaceNode('A.md', {
				getFile: () => file,
				isFile: (value): value is TestFile =>
					Boolean(value) && typeof (value as TestFile).path === 'string',
				openFile: async (entry) => {
					openFile(entry);
				},
			}),
		).resolves.toBe(true);

		expect(openFile).toHaveBeenCalledWith(file);
	});

	it('skips non-file entries', async () => {
		const openFile = vi.fn();

		await expect(
			openWorkspaceNode('Folder', {
				getFile: () => ({ path: 'Folder' }),
				isFile: (_value): _value is TestFile => false,
				openFile: async (entry) => {
					openFile(entry);
				},
			}),
		).resolves.toBe(false);

		expect(openFile).not.toHaveBeenCalled();
	});
});
