import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	HierarchicalEdgeBundlingLayout,
	getRadialLabelPlacement,
} from '../layouts/hierarchical-edge-bundling-layout';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('HierarchicalEdgeBundlingLayout', () => {
	it('places note nodes radially and splits links into Sigma segments', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);

		await new HierarchicalEdgeBundlingLayout().apply(graph);

		expect(graph.hasEdge('A-to-B')).toBe(false);
		expect(graph.getNodeAttribute('Topics/A.md', 'fixed')).toBe(true);
		expect(graph.getNodeAttribute('Topics/B.md', 'fixed')).toBe(true);
		expect(graph.getNodeAttribute('Topics/A.md', 'labelRotation')).toEqual(
			expect.any(Number),
		);
		expect(graph.getNodeAttribute('Topics/A.md', 'labelDirection')).toEqual(
			expect.any(Number),
		);
		expect(
			graph
				.nodes()
				.some((nodeId) =>
					nodeId.startsWith(
						'__hierarchical-edge-bundling-bend__A-to-B__',
					),
				),
		).toBe(true);
		expect(
			graph
				.edges()
				.some((edgeId) =>
					edgeId.startsWith(
						'A-to-B__hierarchical_edge_bundling_segment_',
					),
				),
		).toBe(true);
		expect(
			graph
				.mapEdges((_edge, attributes) => attributes.logicalEdgeId)
				.filter(Boolean),
		).toContain('A-to-B');
	});

	it('keeps final segment directed when source edge is directed', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);

		await new HierarchicalEdgeBundlingLayout().apply(graph);

		const arrowSegments = graph
			.mapEdges((edge, attributes) => ({ edge, type: attributes.type }))
			.filter((item) => item.type === 'arrow');

		expect(arrowSegments.length).toBe(1);
	});

	it('keeps labels radial and readable around the circle', () => {
		expect(getRadialLabelPlacement(0)).toMatchObject({
			rotation: Math.PI / 2,
			direction: 1,
		});
		expect(getRadialLabelPlacement(Math.PI / 2)).toMatchObject({
			rotation: 0,
			direction: 1,
		});
		expect(getRadialLabelPlacement(Math.PI)).toMatchObject({
			rotation: -Math.PI / 2,
			direction: 1,
		});
		expect(getRadialLabelPlacement((Math.PI * 3) / 2)).toMatchObject({
			rotation: 0,
			direction: -1,
		});
	});
});

const projection: GraphProjection = {
	nodes: [
		{
			id: 'Topics/A.md',
			path: 'Topics/A.md',
			title: 'A',
			folder: 'Topics',
			domains: [],
			tags: [],
		},
		{
			id: 'Topics/B.md',
			path: 'Topics/B.md',
			title: 'B',
			folder: 'Topics',
			domains: [],
			tags: [],
		},
	],
	edges: [
		{
			id: 'A-to-B',
			source: 'Topics/A.md',
			target: 'Topics/B.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'Topics/A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['Topics/A.md']),
};
