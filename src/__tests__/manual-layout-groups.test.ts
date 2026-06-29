import { describe, expect, it } from 'vitest';
import type { GraphProjection, ManualLayoutConfig } from '../core/types';
import {
	GraphologyAdapter,
	type GraphPosition,
} from '../graph/graphology-adapter';
import type { GraphPalette } from '../graph/graph-styles';
import {
	getManualGroupNodeIds,
	moveRuntimeManualGroupNodes,
} from '../ui/manual-layout-groups';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('manual layout groups', () => {
	it('lists node ids assigned to a group', () => {
		expect(getManualGroupNodeIds(manualNodes(), 'group-a')).toEqual([
			'A.md',
			'C.md',
			'Missing.md',
		]);
	});

	it('moves runtime nodes assigned to a group and updates snapshot positions', () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		graph.mergeNodeAttributes('A.md', { x: 1, y: 2 });
		graph.mergeNodeAttributes('B.md', { x: 10, y: 20 });
		graph.mergeNodeAttributes('C.md', { x: 100, y: 200 });
		const positions = new Map<string, GraphPosition>();

		moveRuntimeManualGroupNodes(
			graph,
			positions,
			manualNodes(),
			'group-a',
			{ x: 5, y: -2 },
		);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({ x: 6, y: 0 });
		expect(graph.getNodeAttributes('B.md')).toMatchObject({ x: 10, y: 20 });
		expect(graph.getNodeAttributes('C.md')).toMatchObject({ x: 105, y: 198 });
		expect(positions.get('A.md')).toEqual({ x: 6, y: 0 });
		expect(positions.get('C.md')).toEqual({ x: 105, y: 198 });
	});
});

function manualNodes(): ManualLayoutConfig['nodes'] {
	return {
		'A.md': { x: 0, y: 0, groupId: 'group-a' },
		'B.md': { x: 0, y: 0, groupId: 'group-b' },
		'C.md': { x: 0, y: 0, groupId: 'group-a' },
		'Missing.md': { x: 0, y: 0, groupId: 'group-a' },
	};
}

const projection: GraphProjection = {
	nodes: [
		node('A.md', 'A'),
		node('B.md', 'B'),
		node('C.md', 'C'),
	],
	edges: [],
	rootIds: new Set(['A.md']),
};

function node(id: string, title: string): GraphProjection['nodes'][number] {
	return {
		id,
		path: id,
		title,
		folder: '',
		domains: [],
		tags: [],
	};
}
