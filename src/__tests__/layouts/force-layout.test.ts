import { createDeterministicForceGraph } from '@/layouts/deterministic-force-graph';
import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import {
	DEFAULT_GRAPH_FORCE_SETTINGS,
	ForceAtlasLayout,
} from '@/layouts/force-layout';

describe('ForceAtlasLayout', () => {
	it('reproduces stable positions across input order, dragging and worker preference', async () => {
		const make = (reverse: boolean): RuntimeGraph => {
			const graph = new Graph<
				RuntimeNodeAttributes,
				RuntimeEdgeAttributes
			>({ multi: true });
			const ids = Array.from({ length: 90 }, (_, i) => `note-${i}`);
			for (const id of reverse ? [...ids].reverse() : ids)
				graph.addNode(id, node(reverse ? 999 : 0, reverse ? -42 : 1));
			const indices = Array.from({ length: 89 }, (_, i) => i);
			for (const i of reverse ? indices.reverse() : indices)
				graph.addEdgeWithKey(`edge-${i}`, ids[i]!, ids[i + 1]!, edge());
			return graph;
		};
		const graph = make(false),
			reversed = make(true);
		const positions = (g: RuntimeGraph) =>
			g
				.nodes()
				.sort()
				.map((id) => {
					const { x, y } = g.getNodeAttributes(id);
					return [id, x, y];
				});
		const groups = new Map([
			['note-0', 'g'],
			['note-1', 'g'],
			['note-2', 'g'],
		]);
		const solve = (g: RuntimeGraph, worker = false) =>
			new ForceAtlasLayout(
				1,
				DEFAULT_GRAPH_FORCE_SETTINGS,
				groups,
				worker,
				undefined,
				{ stable: true },
			).apply(g);
		await solve(graph);
		const baseline = positions(graph);
		await solve(reversed, true);
		expect(positions(reversed)).toEqual(baseline);
		graph.forEachNode((id) =>
			graph.mergeNodeAttributes(id, { x: 1000, y: -500, fixed: true }),
		);
		await solve(graph);
		expect(positions(graph)).toEqual(baseline);
		expect(graph.size).toBe(89);
	});

	it('keeps existing seeds when adding nodes and leaves stale results unpublished', async () => {
		const graph = new Graph<RuntimeNodeAttributes, RuntimeEdgeAttributes>({
			multi: true,
		});
		graph.addNode('b', node(5, 6));
		graph.addNode('c', node(7, 8));
		const seed =
			createDeterministicForceGraph(graph).getNodeAttributes('b');
		graph.addNode('a', node(9, 10));
		expect(
			createDeterministicForceGraph(graph).getNodeAttributes('b'),
		).toEqual(seed);
		await new ForceAtlasLayout(
			1,
			DEFAULT_GRAPH_FORCE_SETTINGS,
			undefined,
			false,
			() => true,
			{ stable: true },
		).apply(graph);
		expect(graph.getNodeAttributes('b')).toEqual(node(5, 6));
	});

	it.each([false, true])(
		'preserves hidden edges with group layout=%s',
		async (grouped) => {
			const graph = new Graph<
				RuntimeNodeAttributes,
				RuntimeEdgeAttributes,
				Record<string, never>
			>({ multi: true, type: 'mixed' });
			graph.addNode('A', node(0, 0));
			graph.addNode('B', node(1, 1));
			graph.addNode('C', { ...node(2, 0), hidden: true });
			graph.addEdgeWithKey('visible', 'A', 'B', edge());
			graph.addEdgeWithKey('style-hidden', 'A', 'B', {
				...edge(),
				hidden: true,
				styleHidden: true,
			});
			graph.addEdgeWithKey('endpoint-hidden', 'A', 'C', {
				...edge(),
				hidden: true,
				styleHidden: false,
			});
			await new ForceAtlasLayout(
				1,
				DEFAULT_GRAPH_FORCE_SETTINGS,
				grouped
					? new Map([
							['A', 'group'],
							['B', 'group'],
						])
					: new Map(),
			).apply(graph);
			expect(graph.getEdgeAttribute('visible', 'hidden')).toBe(false);
			expect(graph.getEdgeAttributes('style-hidden')).toMatchObject({
				hidden: true,
				styleHidden: true,
			});
			expect(graph.getEdgeAttributes('endpoint-hidden')).toMatchObject({
				hidden: true,
				styleHidden: false,
			});
			expect(graph.getNodeAttribute('C', 'hidden')).toBe(true);
			expect(graph.size).toBe(3);
		},
	);

	it('unfixes cached nodes before applying graph spacing', async () => {
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({
			multi: true,
			type: 'mixed',
		});
		graph.addNode('A', node(0, 0));
		graph.addNode('B', node(1, 1));
		graph.addEdgeWithKey('A-B', 'A', 'B', {
			relation: 'related',
			type: 'line',
			size: 1,
			color: '#888888',
			hidden: false,
			label: '',
			forceLabel: false,
			lineStyle: 'solid',
		});

		await new ForceAtlasLayout(2).apply(graph);

		expect(graph.getNodeAttribute('A', 'fixed')).toBe(false);
		expect(graph.getNodeAttribute('B', 'fixed')).toBe(false);
	});

	it('clusters groups without adding synthetic data to the runtime graph', async () => {
		const graph = new Graph<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes,
			Record<string, never>
		>({ multi: true, type: 'mixed' });
		const positions = {
			A1: [-3, 0],
			A2: [3, 1],
			A3: [0, -3],
			B1: [-2, 1],
			B2: [2, -1],
			B3: [1, 3],
		} as const;
		for (const [nodeId, position] of Object.entries(positions)) {
			graph.addNode(nodeId, node(position[0], position[1]));
		}
		graph.addEdgeWithKey('cross-group', 'A1', 'B1', edge());

		await new ForceAtlasLayout(
			1,
			DEFAULT_GRAPH_FORCE_SETTINGS,
			new Map([
				['A1', 'A'],
				['A2', 'A'],
				['A3', 'A'],
				['B1', 'B'],
				['B2', 'B'],
				['B3', 'B'],
			]),
		).apply(graph);

		expect(graph.order).toBe(6);
		expect(graph.edges()).toEqual(['cross-group']);
		const a = groupMetrics(graph, ['A1', 'A2', 'A3']);
		const b = groupMetrics(graph, ['B1', 'B2', 'B3']);
		const centerDistance = Math.hypot(a.x - b.x, a.y - b.y);
		expect(centerDistance).toBeGreaterThan(
			Math.max(a.radius, b.radius) * 2,
		);
	});
});

function groupMetrics(graph: RuntimeGraph, nodeIds: string[]) {
	const x =
		nodeIds.reduce(
			(sum, nodeId) => sum + graph.getNodeAttribute(nodeId, 'x'),
			0,
		) / nodeIds.length;
	const y =
		nodeIds.reduce(
			(sum, nodeId) => sum + graph.getNodeAttribute(nodeId, 'y'),
			0,
		) / nodeIds.length;
	const radius = Math.max(
		...nodeIds.map((nodeId) =>
			Math.hypot(
				graph.getNodeAttribute(nodeId, 'x') - x,
				graph.getNodeAttribute(nodeId, 'y') - y,
			),
		),
	);
	return { x, y, radius };
}

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
