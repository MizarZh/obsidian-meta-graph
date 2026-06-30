import { describe, expect, it } from 'vitest';
import type { CuratedWorkspaceConfig, WorkspaceState } from '../core/types';
import {
	addCuratedFilesToState,
	removeCuratedFilesFromState,
	updateCuratedFilePathInState,
} from '../workspace/state/curated-state';
import { addGroupInState } from '../workspace/state/manual-layout-state';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace curated state', () => {
	it('renames curated paths across charts and mirrors the active chart', () => {
		const state = createStateWithCuratedFiles(
			{ files: [{ path: 'Old.md', note: 'active note' }] },
			{ files: [{ path: 'Old.md', groupId: 'group-a' }] },
		);

		const result = updateCuratedFilePathInState(state, 'Old.md', 'New.md');

		expect(result.changed).toBe(true);
		expect(result.state.charts[0]?.curated.files).toEqual([
			{ path: 'New.md', note: 'active note' },
		]);
		expect(result.state.charts[1]?.curated.files).toEqual([
			{ path: 'New.md', groupId: 'group-a' },
		]);
		expect(result.state.curated.files).toEqual([
			{ path: 'New.md', note: 'active note' },
		]);
	});

	it('keeps state stable when no curated path changes', () => {
		const state = createStateWithCuratedFiles({
			files: [{ path: 'Old.md' }],
		});

		expect(
			updateCuratedFilePathInState(state, 'Missing.md', 'New.md'),
		).toEqual({
			state,
			changed: false,
		});
		expect(updateCuratedFilePathInState(state, 'Old.md', 'Old.md')).toEqual(
			{
				state,
				changed: false,
			},
		);
	});

	it('adds curated files and creates manual placements in the requested group', () => {
		const state = addGroupInState(createWorkspaceState(100));
		const group = state.manualLayout.groups[0];
		if (!group) {
			throw new Error('Expected default group.');
		}

		const nextState = addCuratedFilesToState(
			state,
			['Folder/Note.md'],
			group.id,
		);

		expect(nextState.curated.files).toEqual([{ path: 'Folder/Note.md' }]);
		expect(nextState.manualLayout.nodes['Folder/Note.md']?.groupId).toBe(
			group.id,
		);
		expect(nextState.layoutRevision).toBe(state.layoutRevision + 1);
	});

	it('keeps duplicate curated additions stable', () => {
		const state = addCuratedFilesToState(createWorkspaceState(100), [
			'Note.md',
		]);

		expect(addCuratedFilesToState(state, ['Note.md'])).toBe(state);
	});

	it('removes curated files and manual placements', () => {
		const state = addCuratedFilesToState(createWorkspaceState(100), [
			'Note.md',
		]);

		const nextState = removeCuratedFilesFromState(state, ['Note.md']);

		expect(nextState.curated.files).toEqual([]);
		expect(nextState.manualLayout.nodes['Note.md']).toBeUndefined();
		expect(nextState.layoutRevision).toBe(state.layoutRevision + 1);
	});
});

function createStateWithCuratedFiles(
	activePatch: Partial<CuratedWorkspaceConfig>,
	secondPatch?: Partial<CuratedWorkspaceConfig>,
): WorkspaceState {
	const state = createWorkspaceState(100);
	const activeChart = state.charts[0];
	if (!activeChart) {
		throw new Error('Expected default chart.');
	}
	const activeCurated = {
		...activeChart.curated,
		...activePatch,
	};
	const active = { ...activeChart, curated: activeCurated };
	const charts = secondPatch
		? [
				active,
				{
					...activeChart,
					id: 'second-chart',
					name: 'Second chart',
					curated: {
						...activeChart.curated,
						...secondPatch,
					},
				},
			]
		: [active];
	return {
		...state,
		charts,
		curated: activeCurated,
	};
}
