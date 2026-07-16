import { describe, expect, it } from 'vitest';
import {
	addGroupInState,
	deleteGroupInState,
	moveCuratedFilesToGroupInState,
	moveGroupInState,
	reorderGroupInState,
	resizeGroupInState,
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
		const group = readFirstGroup(state);
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

		expect(nextState.manualLayout.groupFrames?.[group.id]).toMatchObject({
			x: group.x + 3,
			y: group.y - 1,
		});
		expect(nextState.manualLayout.nodes['A.md']).toEqual({
			x: 4,
			y: 1,
		});
		expect(nextState.manualLayout.nodes['B.md']).toEqual({ x: 10, y: 20 });
	});

	it('keeps group definitions separate from Free geometry', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = readFirstGroup(state);
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
		expect(state.manualLayout.groups).toEqual([]);
		expect(state.manualLayout.groupFrames?.[group.id]).toEqual({
			x: group.x,
			y: group.y,
			width: group.width,
			height: group.height,
		});
	});

	it('deletes a group and preserves node positions without group ids', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = readFirstGroup(state);
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
		expect(nextState.manualLayout.groupFrames).toEqual({});
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

	it('updates Arc padding only in canonical grouping', () => {
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
		expect(nextState.manualLayout.groups).toEqual([]);
		expect(nextState.grouping).not.toBe(state.grouping);
	});

	it('assigns Flow nodes through grouping without manual positions', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'flow',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}

		state = setNodeGroupInState(state, 'A.md', group.id);

		expect(state.grouping.overrides['A.md']).toBe(group.id);
		expect(state.manualLayout.nodes['A.md']).toBeUndefined();
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
		expect(state.manualLayout.groupFrames?.[second.id]).toBeDefined();
	});

	it('assigns Graph nodes through canonical overrides', () => {
		let state = addGroupInState(createWorkspaceState(100));
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}

		state = setNodeGroupInState(state, 'A.md', group.id);

		expect(state.grouping.overrides['A.md']).toBe(group.id);
		expect(state.manualLayout.nodes['A.md']).toBeUndefined();
	});

	it('writes an explicit ungrouped override when a Free node leaves all frames', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'free',
		).state;
		state = addGroupInState(state);
		const group = readFirstGroup(state);
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = setManualNodePositionInState(
			state,
			'A.md',
			{ x: 0, y: 0 },
			group.id,
		);

		state = setManualNodePositionInState(state, 'A.md', { x: 8, y: 8 });

		expect(state.grouping.overrides['A.md']).toBeNull();
		expect(state.manualLayout.nodes['A.md']).toEqual({ x: 8, y: 8 });
		expect(
			setNodeGroupInState(state, 'A.md', undefined).grouping.overrides,
		).not.toHaveProperty('A.md');
	});

	it('moves rule-owned Free members using canonical ownership', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'free',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = updateGroupInState(state, group.id, {
			mode: 'rule',
			rule: {
				id: 'root',
				kind: 'group',
				mode: 'all',
				children: [
					{
						id: 'tag',
						kind: 'condition',
						field: 'tag',
						operator: 'is',
						value: 'research',
					},
				],
			},
		});
		state = {
			...state,
			projection: {
				nodes: [
					{
						id: 'A.md',
						path: 'A.md',
						title: 'A',
						folder: '',
						domains: [],
						tags: ['research'],
					},
				],
				edges: [],
				rootIds: new Set(['A.md']),
			},
		};
		state = setManualNodePositionInState(state, 'A.md', { x: 1, y: 2 });
		state = setNodeGroupInState(state, 'A.md', undefined);

		const nextState = moveGroupInState(state, group.id, { x: 2, y: 3 });

		expect(nextState.manualLayout.nodes['A.md']).toEqual({ x: 3, y: 5 });
	});

	it('resizes a Free frame without changing canonical membership', () => {
		let state = addGroupInState(
			setActiveChartTypeInState(createWorkspaceState(100), 'free').state,
		);
		const group = readFirstGroup(state);
		if (!group) {
			throw new Error('Group is missing.');
		}
		state = setNodeGroupInState(state, 'A.md', group.id);
		const grouping = state.grouping;

		const nextState = resizeGroupInState(state, group.id, {
			x: -2,
			y: -3,
			width: 6,
			height: 5,
		});

		expect(nextState.grouping).toEqual(grouping);
		expect(nextState.manualLayout.groupFrames?.[group.id]).toEqual({
			x: -2,
			y: -3,
			width: 6,
			height: 5,
		});
	});
});

function readFirstGroup(state: ReturnType<typeof createWorkspaceState>) {
	const definition = state.grouping.groups[0];
	const frame = definition
		? state.manualLayout.groupFrames?.[definition.id]
		: undefined;
	return definition && frame ? { ...definition, ...frame } : undefined;
}
