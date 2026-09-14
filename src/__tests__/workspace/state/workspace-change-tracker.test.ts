import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import { withChartStyle } from '@/__tests__/fixtures/chart-style';
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceRenderPlan } from '@/ui/workspace/render-plan';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
	syncWorkspaceRenderBaselineStyles,
} from '@/ui/workspace/change-tracker';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import type { GraphProjection } from '@/core/types';
import { addEdge, addNode, createKnowledgeIndex } from '@/core/knowledge-index';
import { GraphQueryEngine } from '@/query/neighborhood';
import { setCuratedFilesHiddenActionInState } from '@/workspace/actions/curated-actions';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import {
	setFlowLayerSpacingInState,
	setFlowLaneSpacingInState,
} from '@/workspace/state/chart-settings';

describe('workspace change tracker', () => {
	it('applies tracing as a style-only change and restores styles on exit', () => {
		const state = {
			...createWorkspaceState(200),
			projection: createTestProjection(),
		};
		const next = {
			...state,
			trace: { mode: 'upstream' as const, source: 'a.md' },
		};
		for (const [before, after] of [
			[state, next],
			[next, state],
		] as const) {
			expect(
				analyzeWorkspaceStateChanges(
					after,
					before,
					createWorkspaceRenderBaseline(before),
				),
			).toMatchObject({
				shouldRebuild: false,
				forceLayout: false,
				styleRulesChanged: true,
			});
		}
	});
	it('refreshes empty-note status without rebuilding or running layout', () => {
		const state = {
			...createWorkspaceState(200),
			projection: createTestProjection(),
		};
		const next = {
			...state,
			projection: {
				...state.projection,
				nodes: state.projection.nodes.map((node) => ({
					...node,
					isEmpty: true,
				})),
			},
		};
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({
			shouldRebuild: false,
			forceLayout: false,
			styleRulesChanged: true,
		});
		expect(
			analyzeWorkspaceStateChanges(
				state,
				next,
				createWorkspaceRenderBaseline(next),
			),
		).toMatchObject({
			shouldRebuild: false,
			forceLayout: false,
			styleRulesChanged: true,
		});
	});

	it('skips harmless Graph/Free reorder but preserves spatial layout ordering', () => {
		for (const mode of [
			'graph',
			'free',
			'flow',
			'arc',
			'hierarchical-edge-bundling',
		] as const) {
			const state = {
				...createWorkspaceState(200),
				mode,
				projection: createTestProjection(),
			};
			state.grouping = {
				overrides: {},
				groups: ['a', 'b'].map((id) => ({
					id,
					name: id,
					color: '#123456',
					padding: 1,
					mode: 'manual' as const,
				})),
			};
			const next = {
				...state,
				grouping: {
					...state.grouping,
					groups: [...state.grouping.groups].reverse(),
				},
			};
			const changes = analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			);
			const safe = mode === 'graph' || mode === 'free';
			expect(changes.shouldRebuild).toBe(!safe);
			expect(changes.forceLayout).toBe(!safe);
			if (safe)
				expect(createWorkspaceRenderPlan(changes)).toMatchObject({
					rebuild: undefined,
					syncGroupsBeforeRuntime: true,
					runtimeGraphSync: 'none',
				});
			next.grouping.groups[0] = {
				...next.grouping.groups[0]!,
				padding: 2,
			};
			expect(
				analyzeWorkspaceStateChanges(
					next,
					state,
					createWorkspaceRenderBaseline(state),
				).shouldRebuild,
			).toBe(true);
		}
	});

	it('retains rebuild when rule priority changes ownership, but skips it with explicit assignments', () => {
		const state = {
			...createWorkspaceState(200),
			projection: withTimes(createTestProjection(), 100),
		};
		state.grouping = {
			overrides: {},
			groups: ['a', 'b'].map((id) => ({
				id,
				name: id,
				color: '#123456',
				padding: 1,
				mode: 'rule' as const,
				rule: {
					id,
					kind: 'group' as const,
					mode: 'all' as const,
					children: [
						{
							id: `${id}-time`,
							kind: 'condition' as const,
							field: 'file.mtime' as const,
							operator: 'has-value' as const,
							value: '',
						},
					],
				},
			})),
		};
		const check = () =>
			analyzeWorkspaceStateChanges(
				{
					...state,
					grouping: {
						...state.grouping,
						groups: [...state.grouping.groups].reverse(),
					},
				},
				state,
				createWorkspaceRenderBaseline(state),
			);
		expect(check()).toMatchObject({
			shouldRebuild: true,
			forceLayout: true,
		});
		state.grouping.overrides = Object.fromEntries(
			state.projection.nodes.map((node) => [node.id, 'a']),
		);
		expect(check()).toMatchObject({
			shouldRebuild: false,
			forceLayout: false,
		});
	});

	it('does not scan projection nodes for an immutable selection update', () => {
		const state = withChartStyle(
			{
				...createWorkspaceState(200),
				projection: createTestProjection(),
			},
			{
				nodeRules: [
					{
						id: 'done',
						field: 'metadata.status' as const,
						value: 'done',
						color: '#00ff00',
						size: 10,
					},
				],
			},
		);
		const baseline = createWorkspaceRenderBaseline(state);
		const map = vi.spyOn(state.projection.nodes, 'map');
		const some = vi.spyOn(state.projection.nodes, 'some');
		const changes = analyzeWorkspaceStateChanges(
			{ ...state, selectedNodeId: 'a.md' },
			state,
			baseline,
		);
		expect(changes).toMatchObject({
			shouldRebuild: false,
			styleRulesChanged: false,
			forceLayout: false,
		});
		expect(map).not.toHaveBeenCalled();
		expect(some).not.toHaveBeenCalled();
	});

	it('updates metadata-based styles even when graph topology is unchanged', () => {
		const state = withChartStyle(
			{
				...createWorkspaceState(200),
				projection: createTestProjection(),
			},
			{
				nodeRules: [
					{
						id: 'done',
						field: 'metadata.status' as const,
						value: 'done',
						color: '#00ff00',
						size: 10,
					},
				],
			},
		);
		const next = {
			...state,
			projection: {
				...state.projection,
				nodes: state.projection.nodes.map((node) => ({
					...node,
					metadata: { status: 'done' },
					modifiedTime: 200,
				})),
			},
		};
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({
			shouldRebuild: false,
			fitAfterRender: false,
			styleRulesChanged: true,
		});
	});

	it('does not rebuild when time-group membership stays unchanged', () => {
		const state = {
			...createWorkspaceState(200),
			projection: withTimes(createTestProjection(), 100),
		};
		state.grouping = {
			overrides: {},
			groups: [
				{
					id: 'dated',
					name: 'Dated',
					color: '#ff0000',
					padding: 1,
					mode: 'rule',
					rule: {
						id: 'root',
						kind: 'group',
						mode: 'all',
						children: [
							{
								id: 'time',
								kind: 'condition',
								field: 'file.mtime',
								operator: 'has-value',
								value: '',
							},
						],
					},
				},
			],
		};
		expect(
			analyzeWorkspaceStateChanges(
				{ ...state, projection: withTimes(state.projection, 200) },
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({
			shouldRebuild: false,
			fitAfterRender: false,
			forceLayout: false,
		});
	});

	it('rebuilds when a time filter changes the visible projection', () => {
		const index = createKnowledgeIndex();
		const input = withTimes(createTestProjection(), 100);
		input.nodes.forEach((node) => addNode(index, node));
		input.edges.forEach((edge) => addEdge(index, edge));
		const state = createWorkspaceState(200);
		state.query = {
			...state.query,
			roots: [],
			filterRoot: {
				id: 'time',
				kind: 'group',
				mode: 'all',
				children: [
					{
						id: 'before',
						kind: 'condition',
						field: 'file.mtime',
						operator: 'is',
						value: '100',
					},
				],
			},
		};
		const engine = new GraphQueryEngine();
		state.projection = engine.project(index, state.query);
		const baseline = createWorkspaceRenderBaseline(state);
		input.nodes.forEach((node) =>
			addNode(index, { ...node, modifiedTime: 200 }),
		);
		const next = {
			...state,
			projection: engine.project(index, state.query),
		};
		expect(state.projection.edges).toHaveLength(1);
		expect(next.projection.edges).toHaveLength(0);
		expect(
			analyzeWorkspaceStateChanges(next, state, baseline).shouldRebuild,
		).toBe(true);
	});

	it.each([
		'graph',
		'graph-3d',
		'cube',
		'free',
		'flow',
		'arc',
		'hierarchical-edge-bundling',
	] as const)('keeps %s stable after a body-only edit', (mode) => {
		const state = {
			...createWorkspaceState(200),
			mode,
			projection: createTestProjection(),
		};
		const next = { ...state, projection: withTimes(state.projection, 200) };
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({
			shouldRebuild: false,
			fitAfterRender: false,
			forceLayout: false,
			styleRulesChanged: false,
		});
	});

	it.each(['arc', 'hierarchical-edge-bundling'] as const)(
		'retains time sorting in %s',
		(mode) => {
			for (const nodeSort of ['created', 'modified'] as const) {
				const state = {
					...createWorkspaceState(200),
					mode,
					nodeSort,
					projection: withTimes(createTestProjection(), 100),
				};
				const baseline = createWorkspaceRenderBaseline(state);
				const next = {
					...state,
					projection: withTimes(state.projection, 200),
				};
				expect(
					analyzeWorkspaceStateChanges(next, state, baseline)
						.shouldRebuild,
				).toBe(true);
				const unrelated = {
					...state,
					projection: {
						...state.projection,
						nodes: state.projection.nodes.map((node) => ({
							...node,
							[nodeSort === 'created'
								? 'modifiedTime'
								: 'createdTime']: 300,
						})),
					},
				};
				expect(
					analyzeWorkspaceStateChanges(unrelated, state, baseline)
						.shouldRebuild,
				).toBe(false);
			}
		},
	);

	it('ignores a retained time sort in Flow', () => {
		const state = {
			...createWorkspaceState(200),
			mode: 'flow' as const,
			nodeSort: 'modified' as const,
			projection: createTestProjection(),
		};
		expect(
			analyzeWorkspaceStateChanges(
				{ ...state, projection: withTimes(state.projection, 200) },
				state,
				createWorkspaceRenderBaseline(state),
			).shouldRebuild,
		).toBe(false);
	});

	it.each(['global', 'chart'] as const)(
		'refreshes time-dependent %s without rebuilding',
		(key) => {
			const rules = [
				{
					id: 'recent',
					field: 'file.mtime' as const,
					value: '200',
					color: '#ff0000',
					size: 10,
				},
			];
			const base = {
				...createWorkspaceState(200),
				projection: createTestProjection(),
			};
			const state =
				key === 'global'
					? { ...base, globalNodeStyleRules: rules }
					: withChartStyle(base, { nodeRules: rules });

			expect(
				analyzeWorkspaceStateChanges(
					{ ...state, projection: withTimes(state.projection, 200) },
					state,
					createWorkspaceRenderBaseline(state),
				),
			).toMatchObject({
				shouldRebuild: false,
				fitAfterRender: false,
				styleRulesChanged: true,
			});
		},
	);

	it('retains nested time-dependent group layout refresh', () => {
		const state = {
			...createWorkspaceState(200),
			projection: createTestProjection(),
		};
		state.grouping = {
			overrides: {},
			groups: [
				{
					id: 'recent',
					name: 'Recent',
					color: '#ff0000',
					padding: 1,
					mode: 'rule',
					rule: {
						id: 'root',
						kind: 'group',
						mode: 'all',
						children: [
							{
								id: 'nested',
								kind: 'group',
								mode: 'any',
								children: [
									{
										id: 'time',
										kind: 'condition',
										field: 'file.mtime',
										value: '200',
									},
								],
							},
						],
					},
				},
			],
		};
		expect(
			analyzeWorkspaceStateChanges(
				{ ...state, projection: withTimes(state.projection, 200) },
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({ shouldRebuild: true, forceLayout: true });
	});

	it.each([
		[2, 1],
		[1, 2],
		[2, 2],
	])(
		'preserves Flow scale for spacing %s/%s',
		(flowLayerSpacing, flowLaneSpacing) => {
			const document = createDefaultMetaGraphDocument(200, 1.5);
			document.activeChart = 'learning-flow';
			const state = createWorkspaceState(200, 1.5, document);
			const next = setFlowLaneSpacingInState(
				setFlowLayerSpacingInState(state, flowLayerSpacing),
				flowLaneSpacing,
			);
			expect(next.grouping).not.toBe(state.grouping);
			expect(next.grouping).toEqual(state.grouping);
			const baseline = createWorkspaceRenderBaseline(state);
			expect(
				analyzeWorkspaceStateChanges(
					{
						...next,
						grouping: {
							...next.grouping,
							overrides: { 'note.md': 'changed-group' },
						},
					},
					state,
					baseline,
				),
			).toMatchObject({
				fitAfterRender: true,
				preserveViewportScale: false,
			});
			expect(
				analyzeWorkspaceStateChanges(next, state, baseline),
			).toMatchObject({
				shouldRebuild: true,
				forceLayout: true,
				fitAfterRender: false,
				preserveViewportScale: true,
			});
			expect(
				analyzeWorkspaceStateChanges(
					{
						...next,
						activeChartId: 'other',
						charts: [
							...next.charts,
							{ ...next.charts[0]!, id: 'other' },
						],
					},
					state,
					baseline,
				),
			).toMatchObject({
				fitAfterRender: true,
				preserveViewportScale: false,
			});
			expect(
				analyzeWorkspaceStateChanges(
					{ ...state, layoutRevision: state.layoutRevision + 1 },
					state,
					baseline,
				),
			).toMatchObject({
				fitAfterRender: true,
				preserveViewportScale: false,
			});
		},
	);

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

	it('rebuilds and refits when the planar renderer changes', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, renderer: 'g6' as const };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(true);
		expect(changes.forceLayout).toBe(false);
	});

	it('rebuilds grouped Graph, Free, Flow, Arc, and HEB layouts without refitting', () => {
		for (const mode of [
			'graph',
			'free',
			'flow',
			'arc',
			'hierarchical-edge-bundling',
		] as const) {
			const state = { ...createWorkspaceState(200), mode };
			const nextState = {
				...state,
				grouping: {
					...state.grouping,
					groups: [
						{
							id: 'research',
							name: 'Research',
							color: '#7c6ff0',
							mode: 'manual' as const,
							padding: 0.32,
						},
					],
				},
			};
			const changes = analyzeWorkspaceStateChanges(
				nextState,
				state,
				createWorkspaceRenderBaseline(state),
			);

			expect(changes.groupingChanged).toBe(true);
			expect(changes.shouldRebuild).toBe(true);
			expect(changes.fitAfterRender).toBe(false);
			expect(changes.forceLayout).toBe(true);
		}
	});

	it('updates Graph group appearance without rerunning ForceAtlas', () => {
		const state = {
			...createWorkspaceState(200),
			mode: 'graph' as const,
			grouping: {
				groups: [
					{
						id: 'research',
						name: 'Research',
						color: '#7c6ff0',
						mode: 'manual' as const,
						padding: 0.32,
					},
				],
				overrides: { 'A.md': 'research' },
			},
		};
		const nextState = {
			...state,
			grouping: {
				...state.grouping,
				groups: state.grouping.groups.map((group) => ({
					...group,
					color: '#ef4444',
					padding: 2,
				})),
			},
		};

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.groupingChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(true);
		expect(changes.forceLayout).toBe(false);
	});

	it('rebuilds Arc labels without refitting the graph', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, arcLabelAngle: 45 as const };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(false);
		expect(changes.forceLayout).toBe(false);
	});

	it('syncs 3D text resolution without rebuilding the graph', () => {
		const state = createWorkspaceState(200);
		const nextState = {
			...state,
			threeLabelResolution: 'high' as const,
		};

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.threeLabelResolutionChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('detects style-only updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const nextState = withChartStyle(
			{ ...state },
			{
				nodeRules: [
					{
						id: 'red',
						field: 'file.basename',
						operator: 'contains',
						value: 'A',
						color: '#ff0000',
						size: 12,
					},
				],
			},
		) satisfies typeof state;

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

	it('keeps curated hide actions on the visibility-only path', () => {
		const baseState = createWorkspaceState(200);
		const state = {
			...baseState,
			chartSource: 'curated' as const,
			charts: baseState.charts.map((chart) =>
				chart.id === baseState.activeChartId
					? {
							...chart,
							source: 'curated' as const,
							curated: {
								...chart.curated,
								files: [{ path: 'b.md' }],
							},
						}
					: chart,
			),
			curated: {
				...baseState.curated,
				files: [{ path: 'b.md' }],
			},
			projection: {
				...createTestProjection(),
				primaryIds: new Set(['a.md', 'b.md']),
				hiddenNodeIds: new Set<string>(),
			},
		};
		const result = setCuratedFilesHiddenActionInState(
			state,
			['b.md'],
			true,
		);

		const changes = analyzeWorkspaceStateChanges(
			result.state,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(result.runQuery).toBe(false);
		expect(changes.graphVisibilityChanged).toBe(true);
		expect(changes.groupingChanged).toBe(false);
		expect(changes.manualLayoutChanged).toBe(false);
		expect(changes.styleRulesChanged).toBe(false);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('detects default and override style updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const baseline = createWorkspaceRenderBaseline(state);
		for (const nextState of [
			{
				...state,
				defaultNodeStyle: {
					color: '#ff0000',
					size: 7,
					opacity: 1,
					shape: 'circle' as const,
				},
			},
			{
				...state,
				defaultLinkStyle: {
					...state.defaultLinkStyle,
					color: '#00ff00',
				},
			},
			withChartStyle(
				{ ...state },
				{ nodeOverrides: { color: '#ff0000' } },
			),
			withChartStyle({ ...state }, { linkOverrides: { size: 3 } }),
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
		const nextState = withChartStyle(
			{
				...state,
				defaultNodeStyle: {
					color: '#ff0000',
					size: 7,
					opacity: 1,
					shape: 'circle' as const,
				},
			},
			{
				nodeRules: [
					{
						id: 'important',
						field: 'file.basename',
						operator: 'contains',
						value: 'Important',
						color: '#ff0000',
						size: 12,
					},
				],
			},
		) satisfies typeof state;

		syncWorkspaceRenderBaselineStyles(baseline, nextState);

		expect(baseline.defaultNodeStyle).toBe(nextState.defaultNodeStyle);
		expect(baseline.chartStyle?.nodeRules).toBe(
			getActiveChartStyle(nextState).nodeRules,
		);
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

	it('rebuilds Flow edges for corner radius without relayout', () => {
		const state = { ...createWorkspaceState(200), mode: 'flow' as const };
		const nextState = { ...state, flowCornerRadius: 18 };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(false);
		expect(changes.forceLayout).toBe(false);
	});
});

function withTimes(projection: GraphProjection, time: number): GraphProjection {
	return {
		...projection,
		nodes: projection.nodes.map((node) => ({
			...node,
			createdTime: time,
			modifiedTime: time,
		})),
	};
}

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
