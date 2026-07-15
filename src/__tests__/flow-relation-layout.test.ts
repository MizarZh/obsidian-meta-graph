import { describe, expect, it } from 'vitest';
import type { FlowRelationRule, GraphProjection } from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import { ElkFlowLayout } from '../layouts/elk-flow-layout';
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
});

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
