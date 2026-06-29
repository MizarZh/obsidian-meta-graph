import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import { serializeRuntimeGraph } from '../graph/model/runtime-graph-debug';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('runtime graph debug serialization', () => {
	it('serializes compact graph debug state', () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		graph.setEdgeAttribute('A-to-B', 'hidden', true);

		expect(serializeRuntimeGraph(graph)).toMatchObject({
			nodeCount: 2,
			edgeCount: 1,
			nodes: [
				{ id: 'A.md', label: 'A' },
				{ id: 'B.md', label: 'B' },
			],
			edges: [
				{
					id: 'A-to-B',
					source: 'A.md',
					target: 'B.md',
					type: 'arrow',
					hidden: true,
				},
			],
		});
	});
});

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
	rootIds: new Set(['A.md']),
};
