import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeGraph,
	RuntimeNodeAttributes,
	RuntimeEdgeAttributes,
} from '@/graph/model/graphology-adapter';
import { MultilevelStressLayout } from '@/layouts/multilevel-stress-layout';
const ids = ['a', 'b', 'c', 'd', 'e', '孤岛'];
const links = [
	['a', 'b'],
	['b', 'c'],
	['c', 'a'],
	['c', 'd'],
	['d', 'e'],
];
function make(reverse = false): RuntimeGraph {
	const graph = new Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>({
		multi: true,
	});
	for (const id of reverse ? [...ids].reverse() : ids)
		graph.addNode(id, node(999, -42));
	for (const [i, endpoints] of (reverse
		? [...links].reverse()
		: links
	).entries())
		graph.addDirectedEdgeWithKey(
			String(i),
			endpoints[0]!,
			endpoints[1]!,
			edge(),
		);
	return graph;
}
const positions = (graph: RuntimeGraph) =>
	graph
		.nodes()
		.sort()
		.map((id) => {
			const { x, y } = graph.getNodeAttributes(id);
			return [x, y];
		});
describe('Multilevel stress', () => {
	it('matches the Python prototype including an isolated Unicode node', async () => {
		const graph = make();
		await new MultilevelStressLayout(1, 100).apply(graph);
		// Independently computed using experiment.py candidate(..., 'multilevel-stress').
		const expected = [
			[-2.7263428191879346, 0.4054370301846914],
			[-3.098797614670908, -0.43631456135093366],
			[-2.103909152778736, -0.3766820746137355],
			[-1.3405467201640386, -0.9583067782101528],
			[-0.689812312305852, -1.739993327876295],
			[9.959408619107469, 3.105859711866426],
		];
		positions(graph).forEach((point, i) =>
			point.forEach((v, j) => expect(v).toBeCloseTo(expected[i]![j]!, 6)),
		);
	});
	it('ignores insertion order, dragging, edge direction, duplicates and self loops', async () => {
		const a = make(),
			b = make(true);
		b.addDirectedEdgeWithKey('duplicate', 'b', 'a', edge());
		b.addDirectedEdgeWithKey('self', 'a', 'a', edge());
		b.setNodeAttribute('a', 'hidden', true);
		await new MultilevelStressLayout().apply(a);
		await new MultilevelStressLayout().apply(b);
		expect(positions(b)).toEqual(positions(a));
		const baseline = positions(a);
		a.forEachNode((id) => a.mergeNodeAttributes(id, { x: 1234, y: 5678 }));
		await new MultilevelStressLayout().apply(a);
		expect(positions(a)).toEqual(baseline);
		expect(b.getNodeAttribute('a', 'hidden')).toBe(true);
		expect(b.size).toBe(7);
	});
	it('recomputes topology edits from scratch and preserves explicit Groups', async () => {
		const graph = make(),
			fresh = make(true);
		const groups = new Map([
			['a', 'one'],
			['b', 'one'],
			['d', 'two'],
			['e', 'two'],
		]);
		const layout = new MultilevelStressLayout(1, 250, groups);
		await layout.apply(graph);
		graph.forEachNode((id) =>
			graph.mergeNodeAttributes(id, { x: 999, y: 999 }),
		);
		for (const g of [graph, fresh])
			g.addDirectedEdgeWithKey('added', 'a', 'e', edge());
		await layout.apply(graph);
		await new MultilevelStressLayout(
			1,
			250,
			new Map([...groups].reverse()),
		).apply(fresh);
		expect(positions(graph)).toEqual(positions(fresh));
		expect(graph.order).toBe(6);
		expect(graph.size).toBe(6);
		expect(positions(graph).flat().every(Number.isFinite)).toBe(true);
	});
	it('discards a cancelled solve without publishing partial coordinates', async () => {
		const graph = make();
		const before = positions(graph);
		let stale = false;
		await new MultilevelStressLayout(
			1,
			250,
			new Map(),
			() => stale,
			() => {
				stale = true;
				return Promise.resolve();
			},
		).apply(graph);
		expect(positions(graph)).toEqual(before);
	});
	it('handles empty and singleton graphs', async () => {
		const graph = make();
		graph.clear();
		await new MultilevelStressLayout().apply(graph);
		graph.addNode('single', node(99, 99));
		await new MultilevelStressLayout().apply(graph);
		expect(positions(graph)).toEqual([[0, 0]]);
	});
});
function node(x: number, y: number): RuntimeNodeAttributes {
	return {
		label: '',
		x,
		y,
		size: 7,
		color: '#777777',
		path: '',
		folder: '',
		domains: [],
		tags: [],
		fixed: true,
	};
}

function edge(): RuntimeEdgeAttributes {
	return {
		relation: 'related',
		type: 'line',
		size: 1,
		color: '#888888',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
	};
}
