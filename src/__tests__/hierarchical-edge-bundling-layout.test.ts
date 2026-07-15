import { describe, expect, it } from 'vitest';
import type { ChartGroupDefinition, GraphProjection } from '../core/types';
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

	it('uses groups as the first hierarchy level', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		const groups: ChartGroupDefinition[] = [
			group('group-b'),
			group('group-a'),
		];
		const layout = new HierarchicalEdgeBundlingLayout(
			1,
			'path',
			'asc',
			groups,
			new Map([
				['Topics/B.md', 'group-b'],
				['Topics/A.md', 'group-a'],
			]),
		);

		await layout.apply(graph);

		expect(layout.getGroupGeometries().map((item) => item.groupId)).toEqual(
			['group-b', 'group-a'],
		);
		expect(graph.getNodeAttributes('Topics/A.md')).not.toMatchObject(
			graph.getNodeAttributes('Topics/B.md'),
		);
	});

	it('expands angular and radial group bounds with padding', async () => {
		const ownership = new Map([
			['Topics/A.md', 'group-a'],
			['Topics/B.md', 'group-a'],
		]);
		const compact = new HierarchicalEdgeBundlingLayout(
			1,
			'path',
			'asc',
			[{ ...group('group-a'), padding: 0 }],
			ownership,
		);
		const spacious = new HierarchicalEdgeBundlingLayout(
			1,
			'path',
			'asc',
			[{ ...group('group-a'), padding: 5 }],
			ownership,
		);

		await compact.apply(
			new GraphologyAdapter(palette).fromProjection(projection),
		);
		await spacious.apply(
			new GraphologyAdapter(palette).fromProjection(projection),
		);

		const compactGeometry = compact.getGroupGeometries()[0];
		const spaciousGeometry = spacious.getGroupGeometries()[0];
		expect(spaciousGeometry?.startAngle).toBeLessThan(
			compactGeometry?.startAngle ?? 0,
		);
		expect(spaciousGeometry?.endAngle).toBeGreaterThan(
			compactGeometry?.endAngle ?? 0,
		);
		expect(spaciousGeometry?.innerRadius).toBeLessThan(
			compactGeometry?.innerRadius ?? 0,
		);
		expect(spaciousGeometry?.outerRadius).toBeGreaterThan(
			compactGeometry?.outerRadius ?? 0,
		);
	});
});

function group(id: string): ChartGroupDefinition {
	return {
		id,
		name: id,
		color: '#7c6ff0',
		mode: 'manual',
		padding: 0.32,
	};
}

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
