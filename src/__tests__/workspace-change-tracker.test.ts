import { describe, expect, it } from 'vitest';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
	syncWorkspaceRenderBaselineStyles,
} from '../ui/workspace/change-tracker';
import { createWorkspaceState } from '../workspace/state/workspace-state';
import type { GraphProjection } from '../core/types';

describe('workspace change tracker', () => {
	it('requests initial rebuild against empty baseline', () => {
		const state = createWorkspaceState(200);

		const changes = analyzeWorkspaceStateChanges(state, state, {});

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(false);
		expect(changes.forceLayout).toBe(false);
	});

	it('detects renderer display updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, labelSize: state.labelSize + 1 };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.labelSizeChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('detects style-only updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const nextState = {
			...state,
			nodeStyleRules: [
				{
					id: 'red',
					field: 'file.basename',
					operator: 'contains',
					value: 'A',
					color: '#ff0000',
					size: 12,
				},
			],
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.styleRulesChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('ignores equivalent projection objects from refresh', () => {
		const projection = createTestProjection();
		const state = { ...createWorkspaceState(200), projection };
		const nextState = {
			...state,
			projection: {
				nodes: projection.nodes.map((node) => ({ ...node })),
				edges: projection.edges.map((edge) => ({ ...edge })),
				rootIds: new Set(projection.rootIds),
				primaryIds: new Set(projection.primaryIds),
				contextIds: new Set(projection.contextIds),
			},
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(nextState.projection).not.toBe(state.projection);
		expect(changes.shouldRebuild).toBe(false);
		expect(changes.fitAfterRender).toBe(false);
	});

	it('rebuilds when projection content changes', () => {
		const projection = createTestProjection();
		const state = { ...createWorkspaceState(200), projection };
		const nextState = {
			...state,
			projection: {
				...projection,
				edges: [
					...projection.edges,
					{
						id: 'b->c',
						source: 'b.md',
						target: 'c.md',
						relation: 'related',
						directed: false,
						sourcePath: 'b.md',
						sourceField: 'related',
					},
				],
			},
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(true);
	});

	it('does not refit cube after projection content changes', () => {
		const projection = createTestProjection();
		const state = {
			...createWorkspaceState(200),
			mode: 'cube' as const,
			projection,
		};
		const nextState = {
			...state,
			projection: {
				...projection,
				nodes: [
					...projection.nodes,
					{
						id: 'd.md',
						path: 'd.md',
						title: 'D',
						folder: '',
						domains: [],
						tags: [],
					},
				],
			},
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(false);
	});

	it('treats projection hidden node changes as visibility sync only', () => {
		const projection = createTestProjection();
		const state = { ...createWorkspaceState(200), projection };
		const nextState = {
			...state,
			projection: {
				...projection,
				hiddenNodeIds: new Set(['b.md']),
			},
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.graphVisibilityChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
		expect(changes.fitAfterRender).toBe(false);
	});

	it('detects default and override style updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const baseline = createWorkspaceRenderBaseline(state);
		for (const nextState of [
			{ ...state, defaultNodeStyle: { color: '#ff0000', size: 7 } },
			{
				...state,
				defaultLinkStyle: {
					...state.defaultLinkStyle,
					color: '#00ff00',
				},
			},
			{ ...state, nodeStyleOverrides: { color: '#ff0000' } },
			{ ...state, linkStyleOverrides: { size: 3 } },
		]) {
			const changes = analyzeWorkspaceStateChanges(
				nextState,
				state,
				baseline,
			);

			expect(changes.styleRulesChanged).toBe(true);
			expect(changes.shouldRebuild).toBe(false);
		}
	});

	it('syncs style fields into the render baseline', () => {
		const state = createWorkspaceState(200);
		const baseline = createWorkspaceRenderBaseline(state);
		const nextState = {
			...state,
			defaultNodeStyle: { color: '#ff0000', size: 7 },
			nodeStyleRules: [
				{
					id: 'important',
					field: 'file.basename',
					operator: 'contains',
					value: 'Important',
					color: '#ff0000',
					size: 12,
				},
			],
		} satisfies typeof state;

		syncWorkspaceRenderBaselineStyles(baseline, nextState);

		expect(baseline.defaultNodeStyle).toBe(nextState.defaultNodeStyle);
		expect(baseline.nodeStyleRules).toBe(nextState.nodeStyleRules);
		expect(baseline.activeChartId).toBe(state.activeChartId);
	});

	it('forces flow layout after flow direction changes', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, flowDirection: 'RL' as const };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(true);
		expect(changes.forceLayout).toBe(true);
	});
});

function createTestProjection(): GraphProjection {
	return {
		nodes: [
			{
				id: 'a.md',
				path: 'a.md',
				title: 'A',
				folder: '',
				domains: [],
				tags: ['#test'],
			},
			{
				id: 'b.md',
				path: 'b.md',
				title: 'B',
				folder: '',
				domains: [],
				tags: [],
			},
			{
				id: 'c.md',
				path: 'c.md',
				title: 'C',
				folder: '',
				domains: [],
				tags: [],
			},
		],
		edges: [
			{
				id: 'a->b',
				source: 'a.md',
				target: 'b.md',
				relation: 'leads-to',
				directed: true,
				sourcePath: 'a.md',
				sourceField: 'leads-to',
			},
		],
		rootIds: new Set(['a.md']),
		primaryIds: new Set(['a.md']),
		contextIds: new Set(['b.md']),
	};
}
