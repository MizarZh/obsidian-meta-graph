import { describe, expect, it } from 'vitest';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type {
	ChartGroupDefinition,
	FlowRelationRule,
	GraphProjection,
} from '@/core/types';
import { GraphologyAdapter } from '@/graph/model/graphology-adapter';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import {
	ElkFlowLayout,
	extractElkLayoutOrthogonalRoutes,
} from '@/layouts/elk-flow-layout';
import { createFlowLayoutPlan } from '@/layouts/flow-relation-layout';
import { createFlowNodeFootprints } from '@/layouts/flow-node-footprints';
import {
	getFlowGroupHeaderHeight,
	getFlowGroupTitleWidth,
} from '@/layouts/flow-group-frame';
import { isViewportPointInGroup } from '@/layouts/group-shape';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('Flow relation placement', () => {
	it('keeps a short-title singleton group compact in actual ELK output', async () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'leads-to'),
		]);
		const layout = new ElkFlowLayout(
			'straight',
			'LR',
			1,
			1,
			[],
			[{ ...group('one'), padding: 0 }],
			new Map([['A.md', 'one']]),
			0,
			new Map(),
			new Map([['one', 48]]),
		);
		await layout.apply(graph);
		const frame = layout.getGroupGeometries()[0]!;
		expect(frame.width).toBeGreaterThanOrEqual(84);
		expect(frame.width).toBeLessThan(240);
		expect(frame.height).toBeLessThan(180);
	});
	it.each(['LR', 'RL', 'TD', 'DT'] as const)(
		'allocates nonoverlapping title slots before routing (%s)',
		async (direction) => {
			const graph = runtimeGraph([
				edge('A-B', 'A.md', 'B.md', 'A.md', 'leads-to'),
				edge('B-C', 'B.md', 'C.md', 'B.md', 'leads-to'),
			]);
			const definitions = [
				group('one'),
				{ ...group('two'), shape: 'circle' as const },
			];
			const footprints = createFlowNodeFootprints(
				graph,
				14,
				4,
				(text) => text.length * 14,
			);
			const layout = new ElkFlowLayout(
				'orthogonal',
				direction,
				1,
				1,
				[],
				definitions,
				new Map([
					['A.md', 'one'],
					['B.md', 'two'],
				]),
				0,
				footprints,
			);
			await layout.apply(graph);
			const titles = layout.getGroupGeometries().map((frame) => {
				const definition = definitions.find(
					(item) => item.id === frame.groupId,
				)!;
				const band = getFlowGroupHeaderHeight(definition.shape);
				// Only nominal title dimensions participate in layout.
				const titleWidth = getFlowGroupTitleWidth(definition.name);
				const title = {
					x: frame.x + frame.width / 2 - titleWidth / 2,
					y: frame.y + frame.height - band / 2 - 12,
					width: titleWidth,
					height: 24,
				};
				for (const id of ['A.md', 'B.md', 'C.md']) {
					const node = graph.getNodeAttributes(id),
						footprint = footprints.get(id)!;
					expect(
						overlap(title, {
							x: node.x - footprint.width / 2,
							y: node.y - footprint.height / 2,
							...footprint,
						}),
					).toBe(false);
				}
				for (const x of [title.x, title.x + title.width])
					for (const y of [title.y, title.y + title.height])
						expect(
							isViewportPointInGroup(
								{ x, y },
								{
									left: frame.x,
									top: frame.y,
									width: frame.width,
									height: frame.height,
								},
								definition.shape === 'circle'
									? 'circle'
									: 'rectangle',
							),
							JSON.stringify({ frame, title, x, y }),
						).toBe(true);
				return title;
			});
			expect(overlap(titles[0]!, titles[1]!)).toBe(false);
			expect(layout.getEdgeRoutes().size).toBe(2);
		},
	);
	it('places linked notes before or after the metadata owner', () => {
		const graph = runtimeGraph([
			edge('leads', 'A.md', 'B.md', 'A.md', 'Leads-To'),
			edge('prerequisite', 'C.md', 'A.md', 'A.md', 'prerequisites'),
		]);
		const rules: FlowRelationRule[] = [
			{
				id: 'leads-rule',
				field: 'leads-to',
				placement: 'before',
			},
			{
				id: 'prerequisite-rule',
				field: 'prerequisites',
				placement: 'after',
			},
		];

		const plan = createFlowLayoutPlan(graph, rules);

		expect(readOrientations(plan.edges)).toEqual([
			['leads', 'B.md', 'A.md'],
			['prerequisite', 'A.md', 'C.md'],
		]);
		expect(plan.reversedEdgeIds).toEqual(
			new Set(['leads', 'prerequisite']),
		);
		expect(plan.conflictCount).toBe(0);
	});

	it('chains parallel relations into one deterministic layer', () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'related'),
			edge('B-C', 'B.md', 'C.md', 'B.md', 'related'),
		]);

		const plan = createFlowLayoutPlan(graph, [
			{ id: 'related-rule', field: 'related', placement: 'parallel' },
		]);

		expect(plan.edges).toEqual([]);
		expect(plan.nodeLayoutOptions.get('A.md')).toEqual({
			'org.eclipse.elk.layered.crossingMinimization.inLayerPredOf':
				'B.md',
		});
		expect(plan.nodeLayoutOptions.get('B.md')).toEqual({
			'org.eclipse.elk.layered.crossingMinimization.inLayerSuccOf':
				'A.md',
			'org.eclipse.elk.layered.crossingMinimization.inLayerPredOf':
				'C.md',
		});
		expect(plan.nodeLayoutOptions.get('C.md')).toEqual({
			'org.eclipse.elk.layered.crossingMinimization.inLayerSuccOf':
				'B.md',
		});
	});

	it('applies relation placement to ELK coordinates', async () => {
		const beforeGraph = runtimeGraph([
			edge('leads', 'A.md', 'B.md', 'A.md', 'leads-to'),
		]);
		await new ElkFlowLayout('straight', 'LR', 1, 1, [
			{ id: 'leads-rule', field: 'leads-to', placement: 'before' },
		]).apply(beforeGraph);
		expect(beforeGraph.getNodeAttribute('B.md', 'x')).toBeLessThan(
			beforeGraph.getNodeAttribute('A.md', 'x'),
		);

		const parallelGraph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'related'),
			edge('B-C', 'B.md', 'C.md', 'B.md', 'related'),
		]);
		await new ElkFlowLayout('straight', 'LR', 1, 1, [
			{ id: 'related-rule', field: 'related', placement: 'parallel' },
		]).apply(parallelGraph);
		const layerPositions = ['A.md', 'B.md', 'C.md'].map((nodeId) =>
			parallelGraph.getNodeAttribute(nodeId, 'x'),
		);
		expect(new Set(layerPositions).size).toBe(1);
	});

	it('keeps explicit constraints and drops conflicting lower priority edges', () => {
		const graph = runtimeGraph([
			edge('explicit', 'A.md', 'B.md', 'A.md', 'sequence'),
			edge('default', 'B.md', 'A.md', 'B.md', 'reference'),
		]);

		const plan = createFlowLayoutPlan(graph, [
			{ id: 'sequence-rule', field: 'sequence', placement: 'after' },
		]);

		expect(readOrientations(plan.edges)).toEqual([
			['explicit', 'A.md', 'B.md'],
		]);
		expect(plan.conflictCount).toBe(1);
	});

	it('lays out grouped notes as compound nodes without graph duplicates', async () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'leads-to'),
			edge('B-C', 'B.md', 'C.md', 'B.md', 'leads-to'),
		]);
		const groups = [group('research'), group('delivery')];
		const layout = new ElkFlowLayout(
			'straight',
			'LR',
			1,
			1,
			[],
			groups,
			new Map([
				['A.md', 'research'],
				['B.md', 'research'],
				['C.md', 'delivery'],
			]),
		);

		await layout.apply(graph);

		expect(graph.nodes().sort()).toEqual(['A.md', 'B.md', 'C.md']);
		expect(layout.getGroupGeometries().map((item) => item.groupId)).toEqual(
			['research', 'delivery'],
		);
		const research = layout
			.getGroupGeometries()
			.find((item) => item.groupId === 'research');
		const a = graph.getNodeAttributes('A.md');
		expect(a.x).toBeGreaterThan(research?.x ?? Number.POSITIVE_INFINITY);
		expect(a.x).toBeLessThan((research?.x ?? 0) + (research?.width ?? 0));
		expect(a.y).toBeGreaterThan(research?.y ?? Number.POSITIVE_INFINITY);
		expect(a.y).toBeLessThan((research?.y ?? 0) + (research?.height ?? 0));
		for (const frame of layout.getGroupGeometries()) {
			for (const id of frame.nodeIds) {
				const node = graph.getNodeAttributes(id);
				expect(node.x - 60 - frame.x).toBeGreaterThanOrEqual(24);
				expect(
					frame.y + frame.height - (node.y + 22),
				).toBeGreaterThanOrEqual(64);
			}
		}
	});

	it('applies Flow layer spacing inside compound groups', async () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'leads-to'),
		]);
		await new ElkFlowLayout(
			'straight',
			'LR',
			1.5,
			1,
			[],
			[group('research')],
			new Map([
				['A.md', 'research'],
				['B.md', 'research'],
			]),
		).apply(graph);

		const aX = graph.getNodeAttribute('A.md', 'x');
		const bX = graph.getNodeAttribute('B.md', 'x');
		expect(Math.abs(bX - aX) - 120).toBeCloseTo(150);
	});

	it('applies Flow lane spacing inside compound groups', async () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'related'),
		]);
		await new ElkFlowLayout(
			'straight',
			'LR',
			1,
			2,
			[{ id: 'related', field: 'related', placement: 'parallel' }],
			[group('research')],
			new Map([
				['A.md', 'research'],
				['B.md', 'research'],
			]),
		).apply(graph);

		const aY = graph.getNodeAttribute('A.md', 'y');
		const bY = graph.getNodeAttribute('B.md', 'y');
		expect(Math.abs(bY - aY) - 44).toBeCloseTo(120);
	});

	it('keeps parallel relation constraints across different groups', async () => {
		const graph = runtimeGraph([
			edge('A-B', 'A.md', 'B.md', 'A.md', 'related'),
		]);
		await new ElkFlowLayout(
			'straight',
			'LR',
			1,
			1,
			[{ id: 'related', field: 'related', placement: 'parallel' }],
			[group('one'), group('two')],
			new Map([
				['A.md', 'one'],
				['B.md', 'two'],
			]),
		).apply(graph);

		expect(graph.getNodeAttribute('A.md', 'x')).toBeCloseTo(
			graph.getNodeAttribute('B.md', 'x'),
		);
	});

	it('offsets routes emitted in a compound container', () => {
		const result: ElkNode = {
			id: 'root',
			children: [
				{
					id: 'group',
					x: 100,
					y: 50,
					children: [],
				},
			],
			edges: [
				{
					id: 'inside',
					container: 'group',
					sources: ['A.md'],
					targets: ['B.md'],
					sections: [
						{
							id: 'section',
							startPoint: { x: 10, y: 5 },
							endPoint: { x: 30, y: 5 },
						},
					],
				},
			],
		};

		expect(extractElkLayoutOrthogonalRoutes(result).get('inside')).toEqual([
			{ x: 110, y: 55 },
			{ x: 130, y: 55 },
		]);
	});
});

function overlap(
	a: { x: number; y: number; width: number; height: number },
	b: { x: number; y: number; width: number; height: number },
): boolean {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

function group(id: string): ChartGroupDefinition {
	return {
		id,
		name: id,
		color: '#7c6ff0',
		mode: 'manual',
		padding: 0.32,
	};
}

function runtimeGraph(edges: GraphProjection['edges']) {
	const nodeIds = new Set(
		edges.flatMap((item) => [item.source, item.target]),
	);
	return new GraphologyAdapter(palette).fromProjection({
		nodes: [...nodeIds].map((id) => ({
			id,
			path: id,
			title: id.replace(/\.md$/u, ''),
			folder: '',
			domains: [],
			tags: [],
		})),
		edges,
		rootIds: new Set(nodeIds),
	});
}

function edge(
	id: string,
	source: string,
	target: string,
	sourcePath: string,
	sourceField: string,
): GraphProjection['edges'][number] {
	return {
		id,
		source,
		target,
		relation: sourceField.toLocaleLowerCase(),
		directed: true,
		sourcePath,
		sourceField,
	};
}

function readOrientations(
	edges: ReturnType<typeof createFlowLayoutPlan>['edges'],
): string[][] {
	return edges.map((item) => [
		item.id,
		item.sources[0] ?? '',
		item.targets[0] ?? '',
	]);
}
