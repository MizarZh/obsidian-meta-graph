import { describe, expect, it } from 'vitest';
import {
	addCuratedFileInState,
	addCuratedFilesActionInState,
	clearCuratedFilesActionInState,
	removeCuratedFileInState,
	removeCuratedFilesActionInState,
	reorderCuratedFileActionInState,
	reorderCuratedFilesActionInState,
	setCuratedFilesHiddenActionInState,
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
		const state = addCuratedFilesActionInState(createWorkspaceState(100), [
			'Note.md',
		]).state;

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

	it('reorders curated files from a complete ordered path list', () => {
		const state = addCuratedFilesActionInState(createWorkspaceState(100), [
			'A.md',
			'B.md',
			'C.md',
		]).state;

		const reordered = reorderCuratedFilesActionInState(state, [
			'C.md',
			'A.md',
			'B.md',
		]);

		expect(reordered.changed).toBe(true);
		expect(reordered.state.curated.files.map((file) => file.path)).toEqual([
			'C.md',
			'A.md',
			'B.md',
		]);

		const invalid = reorderCuratedFilesActionInState(reordered.state, [
			'C.md',
			'A.md',
		]);

		expect(invalid.changed).toBe(false);
		expect(invalid.state).toBe(reordered.state);
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

	it('hides and shows curated files with query refresh intent', () => {
		const state = addCuratedFilesActionInState(createWorkspaceState(100), [
			'A.md',
			'B.md',
		]).state;

		const hidden = setCuratedFilesHiddenActionInState(
			state,
			['B.md'],
			true,
		);

		expect(hidden.changed).toBe(true);
		expect(hidden.runQuery).toBe(true);
		expect(hidden.state.layoutRevision).toBe(state.layoutRevision);
		expect(hidden.state.curated.files).toEqual([
			{ path: 'A.md' },
			{ path: 'B.md', hidden: true },
		]);

		const shown = setCuratedFilesHiddenActionInState(
			hidden.state,
			['B.md'],
			false,
		);

		expect(shown.changed).toBe(true);
		expect(shown.runQuery).toBe(true);
		expect(shown.state.layoutRevision).toBe(hidden.state.layoutRevision);
		expect(shown.state.curated.files).toEqual([
			{ path: 'A.md' },
			{ path: 'B.md' },
		]);
	});

	it('updates curated paths without query refresh intent', () => {
		const state = addCuratedFileInState(
			createWorkspaceState(100),
			'Old.md',
		).state;

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
