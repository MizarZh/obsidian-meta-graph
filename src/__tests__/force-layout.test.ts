import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';
import {
	DEFAULT_GRAPH_FORCE_SETTINGS,
	ForceAtlasLayout,
} from '../layouts/force-layout';

describe('ForceAtlasLayout', () => {
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
