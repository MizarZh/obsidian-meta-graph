import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import {
	GraphologyAdapter,
	type GraphPosition,
} from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	getFlowInsertionDirection,
	placeNewFlowNodes,
} from '../layouts/flow-insertion';

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
		node('A.md', 'A'),
		node('B.md', 'B'),
		node('C.md', 'C'),
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

describe('flow insertion layout', () => {
	it.each([
		['LR', { x: 1, y: 0, crossX: 0, crossY: 1 }],
		['RL', { x: -1, y: 0, crossX: 0, crossY: 1 }],
		['TD', { x: 0, y: 1, crossX: 1, crossY: 0 }],
		['DT', { x: 0, y: -1, crossX: 1, crossY: 0 }],
	] as const)('maps %s forward insertion direction', (flowDirection, expected) => {
		expect(getFlowInsertionDirection(flowDirection, true)).toEqual(expected);
	});

	it.each([
		['LR', { x: 220, y: 0 }],
		['RL', { x: -220, y: 0 }],
		['TD', { x: 0, y: 220 }],
		['DT', { x: 0, y: -220 }],
	] as const)('places new downstream nodes for %s flow', (flowDirection, expected) => {
		const graph = new GraphologyAdapter(palette).fromProjection(
			projection,
			new Map<string, GraphPosition>([['A.md', { x: 0, y: 0 }]]),
		);

		placeNewFlowNodes(
			graph,
			new Map<string, GraphPosition>([['A.md', { x: 0, y: 0 }]]),
			['B.md'],
			{ flowDirection, flowSpacing: 1 },
		);

		expect(graph.getNodeAttributes('B.md')).toMatchObject({
			...expected,
			fixed: true,
		});
	});

	it('uses cross-axis slots when the direct slot is occupied', () => {
		const positions = new Map<string, GraphPosition>([
			['A.md', { x: 0, y: 0 }],
			['C.md', { x: 220, y: 0 }],
		]);
		const graph = new GraphologyAdapter(palette).fromProjection(
			projection,
			positions,
		);

		placeNewFlowNodes(graph, positions, ['B.md'], {
			flowDirection: 'LR',
			flowSpacing: 1,
		});

		expect(graph.getNodeAttributes('B.md')).toMatchObject({
			x: 220,
			y: 90,
			fixed: true,
		});
	});
});

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
