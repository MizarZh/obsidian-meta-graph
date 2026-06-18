import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import {
	GraphologyAdapter,
	type GraphPosition,
} from '../graph/graphology-adapter';
import type { GraphPalette } from '../graph/graph-styles';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	relatedEdge: '#444444',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
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
});
