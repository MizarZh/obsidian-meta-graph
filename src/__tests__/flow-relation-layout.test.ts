import { describe, expect, it } from 'vitest';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type {
	ChartGroupDefinition,
	FlowRelationRule,
	GraphProjection,
} from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	ElkFlowLayout,
	extractElkLayoutOrthogonalRoutes,
} from '../layouts/elk-flow-layout';
import { createFlowLayoutPlan } from '../layouts/flow-relation-layout';

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
