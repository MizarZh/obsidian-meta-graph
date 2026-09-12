import {
	serializeWorkspaceStateV2,
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
} from '@/workspace/meta-graph-v2/codec';
import { serializeMetaGraphState } from '@/workspace/meta-graph-model';
import { resolveChartGroupOwnership } from '@/query/group-ownership';
import { describe, expect, it } from 'vitest';
import {
	addGroupInState,
	deleteGroupInState,
	moveCuratedFilesToGroupInState,
	moveNodesToGroupInState,
	moveGroupInState,
	reorderGroupInState,
	resizeGroupInState,
	setManualNodePositionInState,
	setNodeGroupInState,
	updateGroupInState,
} from '@/workspace/state/manual-layout-state';
import { setActiveChartTypeInState } from '@/workspace/state/chart-state';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import { createWorkspaceRenderPlan } from '@/ui/workspace/render-plan';

describe('workspace manual layout state', () => {
	it.each(['flow', 'arc', 'hierarchical-edge-bundling'] as const)(
		'preserves manual %s membership through filtering, save/reload, and mode changes',
		(mode) => {
			let state = addGroupInState(
				setActiveChartTypeInState(createWorkspaceState(100), mode)
					.state,
			);
			const id = state.grouping.groups[0]!.id;
			state = updateGroupInState(state, id, { mode: 'manual' });
			state = moveNodesToGroupInState(state, ['A.md'], id);
			expect(state.grouping.groups[0]?.mode).toBe('manual');
			expect(state.grouping.overrides['A.md']).toBe(id);
			expect(state.manualLayout.groupFrames?.[id]).toBeUndefined();
			expect(moveGroupInState(state, id, { x: 1, y: 1 })).toBe(state);
			const node = {
				id: 'A.md',
				path: 'A.md',
				title: 'A',
				tags: [],
				domains: [],
				folder: '',
			};
			expect(
				resolveChartGroupOwnership(
					[],
					state.grouping,
				).membersByGroup.get(id),
			).toEqual([]);
			expect(
				resolveChartGroupOwnership([node], state.grouping).byNode.get(
					node.id,
				)?.groupId,
			).toBe(id);
			const saved = serializeWorkspaceStateV2(
				state,
				createPersistenceContextFromV1(serializeMetaGraphState(state)),
			);
			const parsed = parsePersistedMetaGraphDocumentV2(saved, 100, 1);
			const restored = createWorkspaceState(100, 1, parsed.document);
			expect(restored.grouping).toEqual({
				...state.grouping,
				groups: state.grouping.groups.map((group) => ({
					...group,
					rule: { ...group.rule, id: 'root' },
				})),
			});
			const switched = setActiveChartTypeInState(restored, 'graph').state;
			expect(
				setActiveChartTypeInState(switched, mode).state.grouping,
			).toEqual(restored.grouping);
		},
	);

	it.each(['graph', 'free'] as const)(
		'assigns Query nodes in %s without changing query or saved membership',
		(mode) => {
			const state = addGroupInState(
				setActiveChartTypeInState(createWorkspaceState(100), mode)
					.state,
			);
			const groupId = state.grouping.groups[0]!.id;
			const ids = ['A.md', '__unresolved__/B'];
			const next = moveNodesToGroupInState(state, ids, groupId);
			expect(next.chartSource).toBe('query');
			expect(next.query).toEqual(state.query);
			expect(next.globalQuery).toEqual(state.globalQuery);
			expect(next.curated).toEqual(state.curated);
			for (const id of ids)
				expect(next.grouping.overrides[id]).toBe(groupId);
			const ungrouped = moveNodesToGroupInState(next, ids);
			for (const id of ids)
				expect(ungrouped.grouping.overrides[id]).toBeNull();
			expect(moveNodesToGroupInState(state, [], groupId)).toBe(state);
		},
	);

	it.each([
		'graph',
		'free',
		'flow',
		'arc',
		'hierarchical-edge-bundling',
	] as const)(
		'restricts %s moves to matching conflict groups and rejects mixed batches atomically',
		(mode) => {
			let state = addGroupInState(
				setActiveChartTypeInState(createWorkspaceState(100), mode)
					.state,
			);
			const first = state.grouping.groups[0]!.id;
			const rule = {
				id: 'root',
				kind: 'group' as const,
				mode: 'all' as const,
				children: [
					{
						id: 'tag',
						kind: 'condition' as const,
						field: 'file.tags' as const,
						operator: 'is' as const,
						value: 'research',
					},
				],
			};
			state = updateGroupInState(state, first, { mode: 'rule', rule });
			state = addGroupInState(state);
			const second = state.grouping.groups[1]!.id;
			state = updateGroupInState(state, second, { mode: 'rule', rule });
			const a = {
				id: 'A.md',
				path: 'A.md',
				title: 'A',
				folder: '',
				tags: ['research'],
				domains: [],
			};
			const b = { ...a, id: 'B.md', path: 'B.md', tags: [] };
			state = {
				...state,
				projection: {
					nodes: [a, b],
					edges: [],
					rootIds: new Set<string>(),
				},
			};
			expect(moveNodesToGroupInState(state, [a.id, b.id], second)).toBe(
				state,
			);
			expect(setNodeGroupInState(state, a.id, null)).toBe(state);
			const next = moveNodesToGroupInState(state, [a.id], second);
			expect(next.grouping.overrides[a.id]).toBe(second);
			expect(next.query).toEqual(state.query);
			expect(next.curated).toEqual(state.curated);
			const reset = setNodeGroupInState(next, a.id, undefined);
			expect(reset.grouping.overrides[a.id]).toBeUndefined();
			const dragged = setManualNodePositionInState(next, a.id, {
				x: 10,
				y: 20,
			});
			expect(dragged.grouping.overrides[a.id]).toBe(second);
		},
	);

	it('preserves Cube required groups and 3D assignment restrictions', () => {
		const cube = setActiveChartTypeInState(
			createWorkspaceState(100),
			'cube',
		).state;
		expect(moveNodesToGroupInState(cube, ['A.md'])).toBe(cube);
		const spatial = setActiveChartTypeInState(
			createWorkspaceState(100),
			'graph-3d',
		).state;
		expect(moveNodesToGroupInState(spatial, ['A.md'], 'group')).toBe(
			spatial,
		);
	});

	it.each(['graph', 'free'] as const)(
		'commits %s group positions without rebuilding or restarting force',
		(mode) => {
			let state = addGroupInState(
				setActiveChartTypeInState(createWorkspaceState(100), mode)
					.state,
			);
			const group = readFirstGroup(state)!;
			state = setManualNodePositionInState(
				state,
				'A.md',
				{ x: 1, y: 2 },
				group.id,
			);
			const next = moveGroupInState(
				state,
				group.id,
				{ x: 3, y: -1 },
				{
					'A.md': { x: 8, y: 9 },
				},
			);
			const changes = analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			);
			const plan = createWorkspaceRenderPlan(changes);
			expect(next.grouping).toBe(state.grouping);
			expect(next.query).toBe(state.query);
			expect(next.manualLayout.nodes['A.md']).toEqual({ x: 8, y: 9 });
			expect(state.manualLayout.nodes['A.md']).toEqual({ x: 1, y: 2 });
			expect(
				next.charts.find((chart) => chart.id === next.activeChartId)
					?.layout.manual,
			).toBe(next.manualLayout);
			expect(changes.styleRulesChanged).toBe(false);
			expect(changes.groupingChanged).toBe(false);
			expect(plan.syncGroupsBeforeRuntime).toBe(true);
			expect(plan.rebuild).toBeUndefined();
			expect(plan.restartForceLayout).toBe(false);
			expect(plan.applyForceLayoutToggle).toBe(false);
		},
	);

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
				shape: 'auto',
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

	it('creates rule-based Arc groups by default and rejects unmatched node assignment', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'arc',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		expect(group.mode).toBe('rule');
		expect(group.rule).toBeDefined();

		const nextState = setNodeGroupInState(state, 'A.md', group.id);
		expect(nextState).toBe(state);
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

	it('preserves rule updates for Arc groups', () => {
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
			rule: {
				id: `group-rule-${group.id}`,
				kind: 'group',
				mode: 'all',
				children: [
					{
						id: 'tag-rule',
						kind: 'condition',
						field: 'tag',
						operator: 'is',
						value: 'research',
					},
				],
			},
		});

		expect(nextState.grouping.groups[0]?.rule?.children).toEqual([
			expect.objectContaining({ id: 'tag-rule', value: 'research' }),
		]);
	});

	it('creates rule-based Flow groups by default and rejects unmatched node assignment', () => {
		let state = setActiveChartTypeInState(
			createWorkspaceState(100),
			'flow',
		).state;
		state = addGroupInState(state);
		const group = state.grouping.groups[0];
		if (!group) {
			throw new Error('Group is missing.');
		}
		expect(group.mode).toBe('rule');
		expect(group.rule).toBeDefined();

		const nextState = setNodeGroupInState(state, 'A.md', group.id);
		expect(nextState).toBe(state);
	});

	it('moves groups across multiple positions in one update', () => {
		let state = createWorkspaceState(100);
		for (let i = 0; i < 4; i++) state = addGroupInState(state);
		const ids = state.grouping.groups.map((group) => group.id);
		const source = ids[0]!;
		const moved = reorderGroupInState(state, source, 3);
		expect(moved.grouping.groups.map((group) => group.id)).toEqual([
			...ids.slice(1),
			source,
		]);
		expect(
			reorderGroupInState(moved, source, -3).grouping.groups.map(
				(group) => group.id,
			),
		).toEqual(ids);
		expect(moved.manualLayout).toEqual(state.manualLayout);
		for (const offset of [0, -1, 4, 0.5, NaN, Infinity]) {
			expect(reorderGroupInState(state, source, offset)).toBe(state);
		}
		expect(reorderGroupInState(state, 'missing', 1)).toBe(state);
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

	it('makes a Free frame square when its group changes to circle', () => {
		let state = addGroupInState(
			setActiveChartTypeInState(createWorkspaceState(100), 'free').state,
		);
		const group = readFirstGroup(state);
		if (!group) {
			throw new Error('Group is missing.');
		}

		state = updateGroupInState(state, group.id, { shape: 'circle' });

		expect(state.grouping.groups[0]?.shape).toBe('circle');
		expect(state.manualLayout.groupFrames?.[group.id]).toEqual({
			x: -1.6,
			y: -1.6,
			width: 3.2,
			height: 3.2,
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
