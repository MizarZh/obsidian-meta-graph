import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import type { GraphPalette } from '../graph/graph-styles';
import { createWorkspaceRuntimeGraph } from '../ui/workspace/runtime-graph';
import { createWorkspaceState } from '../workspace/workspace-state';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
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
	],
	edges: [],
	rootIds: new Set(['A.md']),
};

describe('workspace runtime graph', () => {
	it('builds a runtime graph with active workspace styles and cached positions', () => {
		const graph = createWorkspaceRuntimeGraph(
			projection,
			new Map([['A.md', { x: 10, y: 20 }]]),
			createWorkspaceState(200),
			palette,
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			color: '#7c6ff0',
			x: 10,
			y: 20,
			fixed: true,
		});
	});
});
