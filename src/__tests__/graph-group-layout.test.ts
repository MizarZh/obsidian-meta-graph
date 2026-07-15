import Graph from 'graphology';
import { describe, expect, it } from 'vitest';
import type { ChartGroupDefinition } from '../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';
import {
	compactGraphGroups,
	createGraphGroupGeometries,
	createGraphGroupLinks,
	createGroupMemberHaloGeometries,
	getGraphGroupTargetRadius,
} from '../layouts/graph-group-layout';

describe('Graph groups', () => {
	it('creates deterministic ring constraints for group members', () => {
		const links = createGraphGroupLinks(
			new Map([
				['C.md', 'research'],
				['A.md', 'research'],
				['B.md', 'research'],
				['D.md', 'single'],
				['missing.md', 'research'],
			]),
			['A.md', 'B.md', 'C.md', 'D.md'],
		);

		expect(links).toEqual([
			{
				groupId: 'research',
				source: 'A.md',
				target: 'B.md',
			},
			{
				groupId: 'research',
				source: 'B.md',
				target: 'C.md',
			},
			{
				groupId: 'research',
				source: 'C.md',
				target: 'A.md',
			},
		]);
	});

	it('stores visible members in dynamic graph geometries', () => {
		const graph = createGraph();
		graph.addNode('A.md', node(0, 0));
		graph.addNode('B.md', { ...node(1, 0), hidden: true });
		graph.addNode('bend', { ...node(0.5, 0), isBend: true });
		const groups: ChartGroupDefinition[] = [group('research')];

		expect(
			createGraphGroupGeometries(
				graph,
				groups,
				new Map([
					['A.md', 'research'],
					['B.md', 'research'],
					['bend', 'research'],
				]),
			),
		).toEqual([
			{
				kind: 'graph-container',
				groupId: 'research',
				name: 'research',
				color: '#7c6ff0',
				padding: 0.32,
				nodeIds: ['A.md'],
			},
		]);
	});

	it('creates halo-only geometries for Free group members', () => {
		const graph = createGraph();
		graph.addNode('A.md', node(0, 0));
		graph.addNode('B.md', node(1, 0));

		expect(
			createGroupMemberHaloGeometries(
				graph,
				[group('research')],
				new Map([
					['A.md', 'research'],
					['B.md', 'research'],
				]),
			),
		).toEqual([
			{
				kind: 'member-halos',
				groupId: 'research',
				name: 'research',
				color: '#7c6ff0',
				nodeIds: ['A.md', 'B.md'],
			},
		]);
	});

	it('compacts members and separates groups from unrelated nodes', () => {
		const graph = createGraph();
		graph.addNode('A1', node(-10, 0));
		graph.addNode('A2', node(10, 0));
		graph.addNode('B1', node(0, -10));
		graph.addNode('B2', node(0, 10));
		graph.addNode('outside', node(0, 0));
		const groupByNode = new Map([
			['A1', 'A'],
			['A2', 'A'],
			['B1', 'B'],
			['B2', 'B'],
		]);

		compactGraphGroups(graph, groupByNode, 1, 250);

		const distance = 2.5;
		const a = groupMetrics(graph, ['A1', 'A2']);
		const b = groupMetrics(graph, ['B1', 'B2']);
		const targetRadius = getGraphGroupTargetRadius(2, distance);
		expect(a.radius).toBeLessThanOrEqual(targetRadius + 0.001);
		expect(b.radius).toBeLessThanOrEqual(targetRadius + 0.001);
		expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
			a.radius + b.radius + distance * 0.8 - 0.001,
		);
		const outside = graph.getNodeAttributes('outside');
		for (const cluster of [a, b]) {
			expect(
				Math.hypot(outside.x - cluster.x, outside.y - cluster.y),
			).toBeGreaterThanOrEqual(cluster.radius + distance * 0.5 - 0.001);
		}
	});
});

function createGraph(): RuntimeGraph {
	return new Graph<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
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
	};
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
		...nodeIds.map((nodeId) => {
			const attributes = graph.getNodeAttributes(nodeId);
			return Math.hypot(attributes.x - x, attributes.y - y);
		}),
	);
	return { x, y, radius };
}
