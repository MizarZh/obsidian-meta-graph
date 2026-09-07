import Graphology from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import { G6SceneCache } from '@/graph/renderers/g6/g6-scene-cache';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';

describe('G6 scene cache', () => {
	it('builds renderer, logical-edge, extent, route, and spatial indexes once', () => {
		const graph = createGraph();
		const cache = new G6SceneCache(graph, ROUTES);

		expect([...cache.renderedNodeIds]).toEqual(['A', 'B']);
		expect(cache.runtimeEdgesByLogicalId.get('A-B')).toEqual([
			'segment-0',
			'segment-1',
		]);
		expect(cache.incidentEdgesByNode.get('A')).toEqual(
			new Set(['segment-0', 'segment-1']),
		);
		expect(cache.neighborNodeIdsByNode.get('A')).toEqual(
			new Set(['A', 'B']),
		);
		expect(cache.graphExtent).toMatchObject({
			x: [0, 100],
			y: [0, 20],
		});
		expect(cache.nodeSpatialIndex.query({ x: 1, y: 1 }, 5)).toEqual(['A']);
	});

	it('returns dirty styles and updates moved nodes incrementally', () => {
		const graph = createGraph();
		const cache = new G6SceneCache(graph, ROUTES);
		expect(cache.collectStyleChanges()).toEqual({
			nodeIds: [],
			edgeIds: [],
		});

		graph.setNodeAttribute('A', 'color', '#abcdef');
		graph.setEdgeAttribute('segment-0', 'size', 3);
		expect(cache.collectStyleChanges()).toEqual({
			nodeIds: ['A'],
			edgeIds: ['segment-0'],
		});

		cache.updateNodePosition('A', { x: 80, y: 80 });
		expect(cache.nodeSpatialIndex.query({ x: 0, y: 0 }, 5)).toEqual([]);
		expect(cache.nodeSpatialIndex.query({ x: 80, y: 80 }, 5)).toEqual([
			'A',
		]);
	});
});

function createGraph(): RuntimeGraph {
	const graph = new Graphology<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({
		multi: true,
		type: 'directed',
	});
	graph.addNode('A', node('A', 0, 0));
	graph.addNode('bend', { ...node('bend', 50, 20), isBend: true });
	graph.addNode('B', node('B', 100, 0));
	graph.addDirectedEdgeWithKey('segment-0', 'A', 'bend', edge('A-B'));
	graph.addDirectedEdgeWithKey('segment-1', 'bend', 'B', edge('A-B'));
	return graph;
}

function node(id: string, x: number, y: number): RuntimeNodeAttributes {
	return {
		label: id,
		x,
		y,
		size: 8,
		color: '#123456',
		path: id,
		folder: '',
		domains: [],
		tags: [],
	};
}

function edge(logicalEdgeId: string): RuntimeEdgeAttributes {
	return {
		relation: 'test',
		type: 'arrow',
		size: 1,
		color: '#654321',
		hidden: false,
		label: 'edge',
		forceLabel: false,
		lineStyle: 'solid',
		logicalEdgeId,
		logicalSource: 'A',
		logicalTarget: 'B',
	};
}

const ROUTES = new Map<string, PlanarEdgeRoute>([
	[
		'A-B',
		{
			id: 'A-B',
			source: 'A',
			target: 'B',
			start: { x: 0, y: 0 },
			commands: [20, 40, 60, 80, 100].map((x) => ({
				kind: 'line' as const,
				to: { x, y: 0 },
			})),
			parallelRouteOwner: 'layout',
		},
	],
]);
