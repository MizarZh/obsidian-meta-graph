import { describe, expect, it } from 'vitest';
import type {
	FlowDirection,
	FlowEdgeStyle,
	GraphProjection,
} from '@/core/types';
import { GraphologyAdapter } from '@/graph/model/graphology-adapter';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '@/layouts/force-layout';
import {
	applyStableLayout,
	createLayoutSnapshot,
} from '@/layouts/stable-layout';
import {
	captureFlowGeometry,
	prepareInteractiveFlowGraph,
} from '@/layouts/elk-flow-interactive';
import { toG6Data } from '@/graph/renderers/g6/g6-data';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';

describe('fully interactive Flow', () => {
	it.each(['ORTHOGONAL', 'POLYLINE'])(
		'retains long-edge corridors for %s instead of interpolating a staircase',
		async (routing) => {
			const elk = new ELK();
			const children = Array.from({ length: 10 }, (_, i) => ({
				id: `n${i}`,
				width: 120,
				height: 44,
			}));
			const edges = children.slice(1).map((node, i) => ({
				id: `e${i}`,
				sources: [`n${i}`],
				targets: [node.id],
			}));
			for (let i = 3; i < 10; i++)
				edges.push({
					id: `long${i}`,
					sources: ['n0'],
					targets: [`n${i}`],
				});
			const input: ElkNode = {
				id: 'root',
				layoutOptions: {
					'elk.algorithm': 'layered',
					'elk.direction': 'RIGHT',
					'elk.edgeRouting': routing,
				},
				children,
				edges,
			};
			prepareInteractiveFlowGraph(input);
			const cold = await elk.layout(input);
			const history = captureFlowGeometry(cold);
			const preserved = JSON.stringify(history);
			const next = (): ElkNode => ({
				id: 'root',
				layoutOptions: { ...input.layoutOptions },
				children: children.map(({ id, width, height }) => ({
					id,
					width,
					height,
				})),
				edges: edges.map(({ id, sources, targets }) => ({
					id,
					sources: [...sources],
					targets: [...targets],
				})),
			});
			const complete = next(),
				missing = next();
			prepareInteractiveFlowGraph(complete, history);
			prepareInteractiveFlowGraph(missing, {
				...history,
				edges: undefined,
			});
			expect(
				complete.edges!.find((e) => e.id === 'long9')!.sections,
			).toEqual(
				cold
					.edges!.find((e) => e.id === 'long9')!
					.sections?.map(
						({
							id,
							startPoint,
							endPoint,
							bendPoints,
							incomingSections,
							outgoingSections,
						}) => ({
							id,
							startPoint,
							endPoint,
							bendPoints,
							incomingSections,
							outgoingSections,
						}),
					),
			);
			const restored = await elk.layout(complete),
				lost = await elk.layout(missing);
			const bends = (graph: ElkNode) =>
				graph
					.edges!.find((e) => e.id === 'long9')!
					.sections!.reduce(
						(sum, s) => sum + (s.bendPoints?.length ?? 0),
						0,
					);
			expect(bends(restored)).toBeLessThan(bends(lost));
			expect(JSON.stringify(history)).toBe(preserved);
		},
	);
	it('copies nested container paths without reusing reversed relationships', () => {
		const previous: ElkNode = {
			id: 'root',
			children: [
				{
					id: 'group',
					children: [
						{ id: 'a', x: 10, y: 10 },
						{ id: 'b', x: 200, y: 10 },
					],
					edges: [
						{
							id: 'ab',
							sources: ['a'],
							targets: ['b'],
							container: 'group',
							sections: [
								{
									id: 's',
									startPoint: { x: 20, y: 10 },
									bendPoints: [
										{ x: 30, y: 10 },
										{ x: 30, y: 20 },
									],
									endPoint: { x: 200, y: 20 },
								},
							],
						},
					],
				},
			],
		};
		const root: ElkNode = {
			id: 'root',
			children: [{ id: 'group', children: [{ id: 'a' }, { id: 'b' }] }],
			edges: [{ id: 'ab', sources: ['a'], targets: ['b'] }],
		};
		const history = captureFlowGeometry(previous);
		prepareInteractiveFlowGraph(root, history);
		expect(root.edges![0]!.container).toBe('group');
		expect(root.edges![0]!.sections).toEqual(
			history.children![0]!.edges![0]!.sections,
		);
		root.edges![0]!.sections![0]!.startPoint.x = 999;
		expect(
			history.children![0]!.edges![0]!.sections![0]!.startPoint.x,
		).toBe(20);
		const reversed: ElkNode = {
			id: 'root',
			children: [],
			edges: [{ id: 'ab', sources: ['b'], targets: ['a'] }],
		};
		prepareInteractiveFlowGraph(reversed, history);
		expect(reversed.edges![0]!.sections).toBeUndefined();
	});
	it.each(['orthogonal', 'curve'] as const)(
		'keeps repeated unchanged %s refreshes exact, including Group bounds and routes',
		async (style) => {
			const options = {
				...createFlowOptions(style),
				flowLayout: 'elk-interactive' as const,
				groups: [
					{
						id: 'g',
						name: 'Group',
						color: '#777',
						mode: 'manual' as const,
						padding: 0.32,
					},
				],
				groupByNode: new Map([['B.md', 'g']]),
			};
			const snapshot = createLayoutSnapshot();
			await applyStableLayout(
				new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
				snapshot,
				[],
				options,
			);
			const baseline = structuredClone(snapshot);
			for (let i = 0; i < 6; i++) {
				const graph = new GraphologyAdapter(PALETTE).fromProjection(
					PROJECTION,
					snapshot.positions,
				);
				graph.forEachNode((id) =>
					graph.mergeNodeAttributes(id, { x: 999, y: 999 }),
				);
				await applyStableLayout(graph, snapshot, [], {
					...options,
					forceLayout: i % 2 === 0,
				});
				expect(snapshot.positions).toEqual(baseline.positions);
				expect(snapshot.groupGeometries).toEqual(
					baseline.groupGeometries,
				);
				expect(snapshot.orthogonalRoutes).toEqual(
					baseline.orthogonalRoutes,
				);
				expect(snapshot.edgeRoutes).toEqual(baseline.edgeRoutes);
			}
		},
	);
	it.each(['LR', 'RL', 'TD', 'DT'] as const)(
		'does not accumulate Group padding across changed layouts in %s',
		async (flowDirection) => {
			const options = {
				...createFlowOptions('orthogonal'),
				flowDirection,
				flowLayout: 'elk-interactive' as const,
				groups: [
					{
						id: 'g',
						name: 'Group',
						color: '#777',
						mode: 'manual' as const,
						padding: 0.32,
					},
				],
				groupByNode: new Map([['B.md', 'g']]),
			};
			const snapshot = createLayoutSnapshot();
			let baseline: { x: number; y: number } | undefined;
			for (let i = 0; i < 5; i++) {
				const graph = new GraphologyAdapter(PALETTE).fromProjection(
					PROJECTION,
					snapshot.positions,
				);
				await applyStableLayout(graph, snapshot, [], {
					...options,
					flowLayerSpacing: 1 + i * 0.1,
				});
				const bounds = snapshot.groupGeometries[0]!;
				if (bounds.kind !== 'flow-container')
					throw new Error('Missing Flow container');
				const position = snapshot.positions.get('B.md')!;
				const relative = {
					x: position.x - bounds.x,
					y: position.y - bounds.y,
				};
				if (!baseline) baseline = relative;
				// Changing layer spacing may change along-flow routing corridors.
				// The perpendicular coordinate must not accumulate container padding.
				const axis =
					flowDirection === 'LR' || flowDirection === 'RL'
						? 'y'
						: 'x';
				expect(relative[axis]).toBeCloseTo(baseline[axis], 6);
			}
		},
	);
	it('uses model order on first layout and all interactive stages with history', () => {
		const input: ElkNode = {
			id: 'root',
			layoutOptions: { 'elk.direction': 'RIGHT' },
			children: [
				{ id: 'b', width: 120, height: 44 },
				{ id: 'a', width: 120, height: 44 },
			],
			edges: [{ id: 'ab', sources: ['a'], targets: ['b'] }],
		};
		prepareInteractiveFlowGraph(input);
		expect(input.children!.map((n) => n.id)).toEqual(['a', 'b']);
		expect(
			input.layoutOptions!['elk.layered.considerModelOrder.strategy'],
		).toBe('NODES_AND_EDGES');
		const previous: ElkNode = {
			id: 'root',
			children: [{ id: 'a', x: 20, y: 40, width: 120, height: 44 }],
		};
		prepareInteractiveFlowGraph(input, previous);
		for (const stage of [
			'cycleBreaking',
			'layering',
			'crossingMinimization',
			'nodePlacement',
		])
			expect(input.layoutOptions![`elk.layered.${stage}.strategy`]).toBe(
				'INTERACTIVE',
			);
		expect(
			input.layoutOptions![
				'elk.layered.crossingMinimization.forceNodeModelOrder'
			],
		).toBeUndefined();
		expect(input.children![0]).toMatchObject({ x: 20, y: 40 });
		expect(input.children![1]!.x).toBeGreaterThan(20);
	});
	it.each(['LR', 'RL', 'TD', 'DT'] as FlowDirection[])(
		'handles edits and groups in direction %s without using dragged geometry',
		async (flowDirection) => {
			const options = {
				...createFlowOptions('orthogonal'),
				flowDirection,
				flowLayout: 'elk-interactive' as const,
				forceLayout: false,
				groups: [
					{
						id: 'g',
						name: 'Group',
						color: '#777',
						mode: 'manual' as const,
						padding: 0.32,
					},
				],
				groupByNode: new Map([
					['A.md', 'g'],
					['B.md', 'g'],
				]),
			};
			const snapshot = createLayoutSnapshot();
			await applyStableLayout(
				new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
				snapshot,
				[],
				options,
			);
			const history = JSON.stringify(snapshot.flowInteractiveHistory);
			expect(snapshot.flowInteractiveHistory).toBeDefined();
			const clean = structuredClone(snapshot);
			snapshot.positions.forEach((_p, id) =>
				snapshot.positions.set(id, { x: 9999, y: -500 }),
			);
			const edited: GraphProjection = {
				...PROJECTION,
				nodes: [...PROJECTION.nodes, node('D.md')],
				edges: [
					...PROJECTION.edges,
					{
						...PROJECTION.edges[0]!,
						id: 'C-to-D',
						source: 'C.md',
						target: 'D.md',
					},
				],
			};
			const graph = new GraphologyAdapter(PALETTE).fromProjection(
				edited,
				snapshot.positions,
			);
			const reference = new GraphologyAdapter(PALETTE).fromProjection(
				edited,
				clean.positions,
			);
			await applyStableLayout(graph, snapshot, ['D.md'], options);
			await applyStableLayout(reference, clean, ['D.md'], options);
			expect(snapshot.positions).toEqual(clean.positions);
			expect(snapshot.flowInteractiveHistory).toEqual(
				clean.flowInteractiveHistory,
			);
			expect(JSON.stringify(snapshot.flowInteractiveHistory)).not.toBe(
				history,
			);
			expect(snapshot.groupGeometries).toHaveLength(1);
			const data = toG6Data(
				graph,
				undefined,
				undefined,
				undefined,
				undefined,
				snapshot.edgeRoutes,
			);
			expect(data.nodes.map((n) => n.id).sort()).toEqual([
				'A.md',
				'B.md',
				'C.md',
				'D.md',
			]);
			expect(data.edges).toHaveLength(3);
			expect(snapshot.edgeRoutes?.size).toBe(3);
			expect(
				[...snapshot.positions.values()].every(
					(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
				),
			).toBe(true);
		},
	);
	it.each(['straight', 'curve', 'bundled'] as FlowEdgeStyle[])(
		'keeps logical %s routes after edge-only edits and undo',
		async (style) => {
			const options = {
				...createFlowOptions(style),
				forceLayout: false,
				flowLayout: 'elk-interactive' as const,
			};
			const snapshot = createLayoutSnapshot();
			const edited: GraphProjection = {
				...PROJECTION,
				edges: [
					...PROJECTION.edges,
					{
						...PROJECTION.edges[0]!,
						id: 'B-to-C',
						source: 'B.md',
						target: 'C.md',
					},
				],
			};
			for (const projection of [PROJECTION, edited, PROJECTION]) {
				const graph = new GraphologyAdapter(PALETTE).fromProjection(
					projection,
					snapshot.positions,
				);
				const before = snapshot.flowInteractiveHistory;
				await applyStableLayout(graph, snapshot, [], options);
				expect(snapshot.flowInteractiveHistory).not.toBe(before);
				const data = toG6Data(
					graph,
					undefined,
					undefined,
					undefined,
					undefined,
					snapshot.edgeRoutes,
				);
				expect(data.edges.map((e) => e.id).sort()).toEqual(
					projection.edges.map((e) => e.id).sort(),
				);
				expect(data.nodes).toHaveLength(3);
			}
		},
	);
	it('handles a cycle and component merge while retaining every relationship', async () => {
		const options = {
			...createFlowOptions('orthogonal'),
			flowLayout: 'elk-interactive' as const,
			forceLayout: false,
		};
		const snapshot = createLayoutSnapshot();
		const isolated = {
			...PROJECTION,
			nodes: [...PROJECTION.nodes, node('D.md')],
		};
		const merged = {
			...isolated,
			edges: [
				...isolated.edges,
				{
					...PROJECTION.edges[0]!,
					id: 'C-to-D',
					source: 'C.md',
					target: 'D.md',
				},
				{
					...PROJECTION.edges[0]!,
					id: 'D-to-A',
					source: 'D.md',
					target: 'A.md',
				},
			],
		};
		for (const projection of [isolated, merged, isolated]) {
			const graph = new GraphologyAdapter(PALETTE).fromProjection(
				projection,
				snapshot.positions,
			);
			await applyStableLayout(graph, snapshot, [], options);
			const data = toG6Data(
				graph,
				undefined,
				undefined,
				undefined,
				undefined,
				snapshot.edgeRoutes,
			);
			expect(data.edges.map((e) => e.id).sort()).toEqual(
				projection.edges.map((e) => e.id).sort(),
			);
			expect(data.nodes).toHaveLength(4);
			expect(
				[...snapshot.positions.values()].every(
					(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
				),
			).toBe(true);
		}
	});
	it('reopening starts cold, switching back clears history, and stale jobs do not publish', async () => {
		const options = {
			...createFlowOptions('straight'),
			flowLayout: 'elk-interactive' as const,
		};
		const snapshot = createLayoutSnapshot(),
			fresh = createLayoutSnapshot();
		await applyStableLayout(
			new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
			snapshot,
			[],
			options,
		);
		await applyStableLayout(
			new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
			fresh,
			[],
			options,
		);
		expect(fresh.positions).toEqual(snapshot.positions);
		const history = snapshot.flowInteractiveHistory;
		let stale = false;
		const pending = applyStableLayout(
			new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
			snapshot,
			[],
			{ ...options, isStale: () => stale },
		);
		stale = true;
		await pending;
		expect(snapshot.flowInteractiveHistory).toBe(history);
		await applyStableLayout(
			new GraphologyAdapter(PALETTE).fromProjection(PROJECTION),
			snapshot,
			[],
			{ ...options, flowLayout: 'elk' },
		);
		expect(snapshot.flowInteractiveHistory).toBeUndefined();
	});
});
function createFlowOptions(flowEdgeStyle: FlowEdgeStyle) {
	return {
		mode: 'flow' as const,
		forceLayout: true,
		graphSpacing: 1,
		graphForceSettings: DEFAULT_GRAPH_FORCE_SETTINGS,
		flowEdgeStyle,
		flowDirection: 'LR' as const,
		flowLayerSpacing: 1,
		flowLaneSpacing: 1,
		flowCornerRadius: 12,
		arcSpacing: 1,
		arcDirection: 'right' as const,
		arcLabelAngle: 'auto' as const,
		nodeSort: 'name' as const,
		nodeSortDirection: 'asc' as const,
	};
}

function node(id: string): GraphProjection['nodes'][number] {
	return {
		id,
		path: id,
		title: id.replace('.md', ''),
		folder: '',
		domains: [],
		tags: [],
	};
}

const PROJECTION: GraphProjection = {
	nodes: [node('A.md'), node('B.md'), node('C.md')],
	edges: [
		{
			id: 'A-to-B',
			source: 'A.md',
			target: 'B.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
		{
			id: 'A-to-C',
			source: 'A.md',
			target: 'C.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['A.md']),
};

const PALETTE: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: '#ffffff',
	background: '#ffffff',
};
