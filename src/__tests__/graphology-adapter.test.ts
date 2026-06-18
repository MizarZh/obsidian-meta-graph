import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import {
	GraphologyAdapter,
	type GraphPosition,
} from '../graph/graphology-adapter';
import type { GraphPalette } from '../graph/graph-styles';
import {
	applyElkOrthogonalRoutes,
	applyOrthogonalFlowEdges,
	toElkDirection,
} from '../layouts/elk-flow-layout';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	relatedEdge: '#444444',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

const projection: GraphProjection = {
	nodes: [
		{
			id: 'A.md',
			path: 'A.md',
			title: 'A',
			folder: '',
			domains: [],
			tags: [],
		},
		{
			id: 'B.md',
			path: 'B.md',
			title: 'B',
			folder: '',
			domains: [],
			tags: [],
		},
	],
	edges: [],
	rootIds: new Set(['A.md']),
};

describe('GraphologyAdapter positions', () => {
	it.each([
		['LR', 'RIGHT'],
		['RL', 'LEFT'],
		['TD', 'DOWN'],
		['DT', 'UP'],
	] as const)('maps flow direction %s to ELK %s', (direction, expected) => {
		expect(toElkDirection(direction)).toBe(expected);
	});

	it('uses deterministic initial positions', () => {
		const adapter = new GraphologyAdapter(palette);
		const first = adapter.fromProjection(projection);
		const second = adapter.fromProjection(projection);

		expect(first.getNodeAttributes('A.md')).toMatchObject(
			second.getNodeAttributes('A.md'),
		);
		expect(first.getNodeAttributes('B.md')).toMatchObject(
			second.getNodeAttributes('B.md'),
		);
	});

	it('restores cached positions and fixes existing nodes for layout', () => {
		const positions = new Map<string, GraphPosition>([
			['A.md', { x: 12, y: 34 }],
		]);
		const graph = new GraphologyAdapter(palette).fromProjection(
			projection,
			positions,
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			x: 12,
			y: 34,
			fixed: true,
		});
		expect(graph.getNodeAttribute('B.md', 'fixed')).toBe(false);
	});

	it('splits non-horizontal flow edges into orthogonal segments', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
			],
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 100, y: 80 });

		applyOrthogonalFlowEdges(graph);

		expect(graph.hasEdge('A-to-B')).toBe(false);
		expect(graph.order).toBe(4);
		expect(graph.size).toBe(3);
		expect(graph.getEdgeAttribute('A-to-B__segment_1', 'type')).toBe('line');
		expect(graph.getEdgeAttribute('A-to-B__segment_2', 'type')).toBe('line');
		expect(graph.getEdgeAttribute('A-to-B__segment_3', 'type')).toBe('arrow');
		expect(
			graph.getNodeAttribute('__flow-bend__A-to-B__1', 'isBend'),
		).toBe(true);
	});

	it('uses ELK section points for orthogonal segments', () => {
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
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
			],
		});
		graph.mergeNodeAttributes('A.md', { x: 0, y: 0 });
		graph.mergeNodeAttributes('B.md', { x: 200, y: 100 });

		applyElkOrthogonalRoutes(graph, [
			{
				id: 'A-to-B',
				sources: ['A.md'],
				targets: ['B.md'],
				sections: [
					{
						id: 'section',
						startPoint: { x: 60, y: 0 },
						bendPoints: [
							{ x: 120, y: 0 },
							{ x: 120, y: 100 },
						],
						endPoint: { x: 140, y: 100 },
					},
				],
			},
		]);

		expect(
			graph.getNodeAttributes('__flow-bend__A-to-B__2'),
		).toMatchObject({ x: 120, y: 0 });
		expect(
			graph.getNodeAttributes('__flow-bend__A-to-B__3'),
		).toMatchObject({ x: 120, y: 100 });
	});
});
