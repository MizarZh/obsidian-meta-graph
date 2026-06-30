import { describe, expect, it } from 'vitest';
import {
	addCuratedFileInState,
	addCuratedFilesActionInState,
	clearCuratedFilesActionInState,
	removeCuratedFileInState,
	removeCuratedFilesActionInState,
	reorderCuratedFileActionInState,
	updateCuratedFilePathActionInState,
	updateCuratedWorkspaceActionInState,
} from '../workspace/actions/curated-actions';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace curated actions', () => {
	it('adds and removes curated files with query refresh intent', () => {
		const state = createWorkspaceState(100);
		const added = addCuratedFileInState(state, 'Note.md');

		expect(added.changed).toBe(true);
		expect(added.runQuery).toBe(true);
		expect(added.state.curated.files).toEqual([{ path: 'Note.md' }]);

		const removed = removeCuratedFileInState(added.state, 'Note.md');

		expect(removed.changed).toBe(true);
		expect(removed.runQuery).toBe(true);
		expect(removed.state.curated.files).toEqual([]);
	});

	it('reports no-op curated file changes', () => {
		const state = addCuratedFilesActionInState(
			createWorkspaceState(100),
			['Note.md'],
		).state;

		expect(addCuratedFilesActionInState(state, ['Note.md'])).toEqual({
			state,
			changed: false,
			runQuery: true,
		});
		expect(removeCuratedFilesActionInState(state, ['Missing.md'])).toEqual({
			state,
			changed: false,
			runQuery: true,
		});
	});

	it('reorders and clears curated files', () => {
		const state = addCuratedFilesActionInState(createWorkspaceState(100), [
			'A.md',
			'B.md',
		]).state;

		const reordered = reorderCuratedFileActionInState(
			state,
			'B.md',
			'A.md',
			'before',
		);

		expect(reordered.changed).toBe(true);
		expect(reordered.runQuery).toBe(true);
		expect(reordered.state.curated.files.map((file) => file.path)).toEqual([
			'B.md',
			'A.md',
		]);

		const cleared = clearCuratedFilesActionInState(reordered.state);

		expect(cleared.changed).toBe(true);
		expect(cleared.runQuery).toBe(true);
		expect(cleared.state.curated.files).toEqual([]);
	});

	it('updates curated workspace settings with query refresh intent', () => {
		const state = createWorkspaceState(100);

		const result = updateCuratedWorkspaceActionInState(state, {
			context: {
				...state.curated.context,
				enabled: true,
			},
		});

		expect(result.changed).toBe(true);
		expect(result.runQuery).toBe(true);
		expect(result.state.curated.context.enabled).toBe(true);
	});

	it('updates curated paths without query refresh intent', () => {
		const state = addCuratedFileInState(createWorkspaceState(100), 'Old.md').state;

		const result = updateCuratedFilePathActionInState(
			state,
			'Old.md',
			'New.md',
		);

		expect(result.changed).toBe(true);
		expect(result.runQuery).toBe(false);
		expect(result.state.curated.files).toEqual([{ path: 'New.md' }]);
	});
});
