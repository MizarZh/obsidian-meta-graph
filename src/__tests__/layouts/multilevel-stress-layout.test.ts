import { separateStressGroups } from '@/layouts/stress-group-separation';
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
	it('reduces satellite area while giving a dense core more visible spacing', async () => {
		const graph = make();
		graph.clear();
		const core = Array.from({ length: 20 }, (_, i) => `core-${i}`);
		const tail = Array.from({ length: 12 }, (_, i) => `tail-${i}`);
		const islands = Array.from({ length: 12 }, (_, i) => `island-${i}`);
		for (const id of [...core, ...tail, ...islands])
			graph.addNode(id, node(0, 0));
		for (let i = 0; i < core.length; i++)
			for (let j = i + 1; j < core.length; j++)
				graph.addEdge(core[i]!, core[j]!, edge());
		graph.addEdge(core[0]!, tail[0]!, edge());
		for (let i = 1; i < tail.length; i++)
			graph.addEdge(tail[i - 1]!, tail[i]!, edge());
		for (let i = 0; i < islands.length; i += 2)
			graph.addEdge(islands[i]!, islands[i + 1]!, edge());
		const original = graph.copy();
		await new MultilevelStressLayout(
			1,
			100,
			new Map(),
			undefined,
			undefined,
			{ refine: false },
		).apply(original);
		await new MultilevelStressLayout(1, 100).apply(graph);
		const metrics = (g: RuntimeGraph) => {
			const points = positions(g),
				xs = points.map((p) => p[0]!),
				ys = points.map((p) => p[1]!);
			const width = Math.max(...xs) - Math.min(...xs),
				height = Math.max(...ys) - Math.min(...ys);
			const near = core
				.map((id) => {
					const p = g.getNodeAttributes(id);
					return Math.min(
						...core
							.filter((other) => other !== id)
							.map((other) => {
								const q = g.getNodeAttributes(other);
								return Math.hypot(p.x - q.x, p.y - q.y);
							}),
					);
				})
				.sort((a, b) => a - b);
			return {
				area: width * height,
				visibleGap: near[10]! / Math.max(width, height),
			};
		};
		const before = metrics(original),
			after = metrics(graph);
		expect(after.area).toBeLessThan(before.area);
		expect(after.visibleGap).toBeGreaterThan(before.visibleGap * 1.3);
		expect(graph.order).toBe(original.order);
		expect(graph.size).toBe(original.size);
	});
	it('separates final Group frames without shrinking their internal geometry', () => {
		const graph = make();
		graph.clear();
		const groups = new Map<string, string>();
		for (const group of ['rectangle', 'circle', 'third'])
			for (const [i, [x, y]] of [
				[-2, -1],
				[2, -1],
				[-2, 1],
				[2, 1],
			].entries()) {
				const id = `${group}-${i}`;
				graph.addNode(id, node(x!, y!));
				groups.set(id, group);
			}
		graph.addNode('outside', node(0, 0));
		graph.addEdge('rectangle-0', 'circle-0', edge());
		const before = graph.copy();
		separateStressGroups(graph, groups, [], 1);
		const centers = ['rectangle', 'circle', 'third'].map((group) => {
			const first = graph.getNodeAttributes(`${group}-0`),
				opposite = graph.getNodeAttributes(`${group}-3`);
			expect(opposite.x - first.x).toBeCloseTo(4, 10);
			expect(opposite.y - first.y).toBeCloseTo(2, 10);
			return {
				x: (first.x + opposite.x) / 2,
				y: (first.y + opposite.y) / 2,
			};
		});
		for (let i = 0; i < centers.length; i++)
			for (let j = i + 1; j < centers.length; j++) {
				// Circle encloses the padded rectangle; stronger than member-only avoidance.
				expect(
					Math.hypot(
						centers[i]!.x - centers[j]!.x,
						centers[i]!.y - centers[j]!.y,
					),
				).toBeGreaterThan(2 * Math.hypot(2.4, 1.4));
			}
		const outside = graph.getNodeAttributes('outside');
		for (const center of centers)
			expect(
				Math.hypot(outside.x - center.x, outside.y - center.y),
			).toBeGreaterThan(Math.hypot(2.4, 1.4));
		separateStressGroups(before, new Map([...groups].reverse()), [], 1);
		expect(positions(graph)).toEqual(positions(before));
		expect(graph.size).toBe(1);
	});
	it('keeps connected Groups separate after complete stress spacing refinement', async () => {
		const graph = make();
		const groups = new Map([
			['a', 'one'],
			['b', 'one'],
			['c', 'two'],
			['d', 'two'],
		]);
		await new MultilevelStressLayout(1, 100, groups).apply(graph);
		const groupBounds = (ids: string[]) => {
			const xs = ids.map((id) => graph.getNodeAttribute(id, 'x')),
				ys = ids.map((id) => graph.getNodeAttribute(id, 'y'));
			const width = Math.max(...xs) - Math.min(...xs),
				height = Math.max(...ys) - Math.min(...ys);
			return {
				x: (Math.min(...xs) + Math.max(...xs)) / 2,
				y: (Math.min(...ys) + Math.max(...ys)) / 2,
				r: Math.hypot(width / 2 + 0.4, height / 2 + 0.4),
			};
		};
		const a = groupBounds(['a', 'b']),
			b = groupBounds(['c', 'd']);
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
	});
	it('matches the Python prototype including an isolated Unicode node', async () => {
		const graph = make();
		await new MultilevelStressLayout(
			1,
			100,
			new Map(),
			undefined,
			undefined,
			{ refine: false },
		).apply(graph);
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
