import { describe, expect, it } from 'vitest';
import {
	addGroupInState,
	deleteGroupInState,
	moveCuratedFilesToGroupInState,
	moveGroupInState,
	reorderGroupInState,
	setManualNodePositionInState,
	setNodeGroupInState,
	updateGroupInState,
} from '../workspace/state/manual-layout-state';
import { setActiveChartTypeInState } from '../workspace/state/chart-state';
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

	it('keeps legacy manual groups synchronized with chart grouping', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = state.manualLayout.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = updateGroupInState(state, group.id, { name: 'Research' });
		state = setManualNodePositionInState(
			state,
			'A.md',
			{ x: 1, y: 2 },
			group.id,
		);

		expect(state.grouping.groups).toEqual([
			{
				id: group.id,
				name: 'Research',
				color: group.color,
				mode: 'manual',
				padding: group.padding,
			},
		]);
		expect(state.grouping.overrides).toEqual({ 'A.md': group.id });
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
		expect(nextState.grouping).toEqual({ groups: [], overrides: {} });
	});

	it('keeps empty group moves referentially stable', () => {
		const state = createWorkspaceState(100);

		expect(moveCuratedFilesToGroupInState(state, [])).toBe(state);
	});

	it('assigns Arc nodes without creating manual positions', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'arc',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}

		state = setNodeGroupInState(state, 'A.md', group.id);
		expect(state.grouping.overrides['A.md']).toBe(group.id);
		expect(state.manualLayout.nodes['A.md']).toBeUndefined();

		state = setNodeGroupInState(state, 'A.md', null);
		expect(state.grouping.overrides['A.md']).toBeNull();

		state = setNodeGroupInState(state, 'A.md', undefined);
		expect(state.grouping.overrides).not.toHaveProperty('A.md');
	});

	it('updates Arc padding in both chart grouping and legacy groups', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'arc',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}

		const nextState = updateGroupInState(state, group.id, {
			padding: 0.75,
		});

		expect(nextState.grouping.groups[0]?.padding).toBe(0.75);
		expect(nextState.manualLayout.groups[0]?.padding).toBe(0.75);
		expect(nextState.grouping).not.toBe(state.grouping);
	});

	it('reorders chart groups as their conflict priority', () => {
		let state = addGroupInState(createWorkspaceState(100));
		state = addGroupInState(state);
		const second = state.grouping.groups[1];
		if (!second) {
			throw new Error('Second group is missing.');
		}

		state = reorderGroupInState(state, second.id, -1);

		expect(state.grouping.groups[0]?.id).toBe(second.id);
		expect(state.manualLayout.groups[0]?.id).toBe(second.id);
	});
});
