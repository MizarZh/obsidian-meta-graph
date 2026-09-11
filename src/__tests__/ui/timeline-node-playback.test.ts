import { describe, expect, it } from 'vitest';
import {
	applyTimeline,
	indexTimeline,
	normalizeTimeline,
	timelineNodeProgress,
} from '@/graph/timeline';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setTimelineInState } from '@/workspace/state/chart-settings';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import {
	createPersistenceContextFromV1,
	serializeWorkspaceStateV2,
	parsePersistedMetaGraphDocumentV2,
} from '@/workspace/meta-graph-v2/codec';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';

function stateWithTies() {
	const state = createWorkspaceState(200);
	state.projection = {
		nodes: ['c', 'a', 'b'].map((id) => ({
			id,
			path: id,
			title: id,
			createdTime: 100,
			folder: '',
			domains: [],
			tags: [],
		})),
		edges: [],
		rootIds: new Set<string>(),
	};
	return { ...state, projection: state.projection };
}
describe('per-node timeline', () => {
	it.each(['created', 'modified'])(
		'sorts %s time first, then names only for exact ties',
		(field) => {
			const state = stateWithTies();
			const nodes = [
				{
					...state.projection.nodes[0]!,
					id: 'first-id',
					title: 'Zebra',
					createdTime: 101,
					modifiedTime: 101,
				},
				{
					...state.projection.nodes[0]!,
					id: 'last-id',
					title: 'Alpha',
					createdTime: 101,
					modifiedTime: 101,
				},
				{
					...state.projection.nodes[0]!,
					id: 'earlier',
					title: 'Zulu',
					createdTime: 100,
					modifiedTime: 100,
				},
				{
					...state.projection.nodes[0]!,
					id: 'later',
					title: 'Aardvark',
					createdTime: 102,
					modifiedTime: 102,
				},
			];
			const config = normalizeTimeline({ step: 'node' });
			expect(
				timelineNodeProgress(config, indexTimeline(nodes, field)).ids,
			).toEqual(['earlier', 'last-id', 'first-id', 'later']);
			expect(
				timelineNodeProgress(
					config,
					indexTimeline([...nodes].reverse(), field),
				).ids,
			).toEqual(['earlier', 'last-id', 'first-id', 'later']);
		},
	);

	it('reveals exactly one node per increment even with identical timestamps', () => {
		const state = stateWithTies();
		const index = indexTimeline(state.projection.nodes, 'created');
		const config = normalizeTimeline({
			enabled: true,
			step: 'node',
			start: 100,
			end: 100,
			nodeCount: 0,
		});
		expect(timelineNodeProgress(config, index).ids).toEqual([
			'a',
			'b',
			'c',
		]);
		for (let count = 0; count <= 3; count++) {
			const view = applyTimeline(state, { ...config, nodeCount: count });
			expect(
				view
					.projection!.nodes.filter(
						(node) => !view.projection!.hiddenNodeIds!.has(node.id),
					)
					.map((node) => node.id)
					.sort(),
			).toEqual(['a', 'b', 'c'].slice(0, count));
			expect(
				analyzeWorkspaceStateChanges(
					view,
					state,
					createWorkspaceRenderBaseline(state),
				).shouldRebuild,
			).toBe(false);
		}
	});
	it('excludes hidden and out-of-range nodes from the sequence and keeps undated policy', () => {
		const state = stateWithTies();
		state.projection.nodes.push(
			{ ...state.projection.nodes[0]!, id: 'later', createdTime: 200 },
			{
				...state.projection.nodes[0]!,
				id: 'undated',
				createdTime: undefined,
			},
		);
		const projection = {
			...state.projection,
			hiddenNodeIds: new Set(['a']),
		};
		const config = normalizeTimeline({
			enabled: true,
			step: 'node',
			start: 100,
			end: 150,
			nodeCount: 1,
		});
		const progress = timelineNodeProgress(
			config,
			indexTimeline(projection.nodes, 'created'),
			projection.hiddenNodeIds,
		);
		expect(progress).toEqual({ ids: ['b', 'c'], count: 1, current: 100 });
		const view = applyTimeline({ ...state, projection }, config);
		expect([...view.projection!.hiddenNodeIds!].sort()).toEqual([
			'a',
			'c',
			'later',
		]);
	});
	it('persists count separately from date so ties do not reappear on reopen', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = setTimelineInState(
			createWorkspaceState(200, 1.5, document),
			{ enabled: true, step: 'node', current: 100, nodeCount: 1 },
		);
		const text = serializeWorkspaceStateV2(
			state,
			createPersistenceContextFromV1(document),
		);
		const parsed = parsePersistedMetaGraphDocumentV2(text, 200, 1.5);
		expect(
			createWorkspaceState(200, 1.5, parsed.document).timeline,
		).toMatchObject({ step: 'node', current: 100, nodeCount: 1 });
		expect(normalizeTimeline({ nodeCount: -1 }).nodeCount).toBeNull();
		expect(normalizeTimeline({ nodeCount: Infinity }).nodeCount).toBeNull();
	});
});
