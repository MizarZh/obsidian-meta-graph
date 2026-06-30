import { describe, expect, it } from 'vitest';
import {
	addGroupInState,
	deleteGroupInState,
	moveCuratedFilesToGroupInState,
	moveGroupInState,
	setManualNodePositionInState,
} from '../workspace/state/manual-layout-state';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace manual layout state', () => {
	it('keeps no-op node position updates referentially stable', () => {
		const state = setManualNodePositionInState(
			createWorkspaceState(100),
			'A.md',
			{ x: 1, y: 2 },
			'group-a',
		);

		const nextState = setManualNodePositionInState(
			state,
			'A.md',
			{ x: 1, y: 2 },
			'group-a',
		);

		expect(nextState).toBe(state);
	});

	it('moves a group and all assigned manual nodes', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = state.manualLayout.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = setManualNodePositionInState(
			state,
			'A.md',
			{ x: 1, y: 2 },
			group.id,
		);
		state = setManualNodePositionInState(state, 'B.md', { x: 10, y: 20 });

		const nextState = moveGroupInState(state, group.id, { x: 3, y: -1 });

		expect(nextState.manualLayout.groups[0]).toMatchObject({
			x: group.x + 3,
			y: group.y - 1,
		});
		expect(nextState.manualLayout.nodes['A.md']).toEqual({
			x: 4,
			y: 1,
			groupId: group.id,
		});
		expect(nextState.manualLayout.nodes['B.md']).toEqual({ x: 10, y: 20 });
	});

	it('deletes a group and preserves node positions without group ids', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = state.manualLayout.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = setManualNodePositionInState(
			state,
			'A.md',
			{ x: 1, y: 2 },
			group.id,
		);

		const nextState = deleteGroupInState(state, group.id);

		expect(nextState.manualLayout.groups).toEqual([]);
		expect(nextState.manualLayout.nodes['A.md']).toEqual({ x: 1, y: 2 });
	});

	it('keeps empty group moves referentially stable', () => {
		const state = createWorkspaceState(100);

		expect(moveCuratedFilesToGroupInState(state, [])).toBe(state);
	});
});
