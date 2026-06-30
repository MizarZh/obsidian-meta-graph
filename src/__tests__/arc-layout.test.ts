import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import { ArcLayout, createArcPoints } from '../layouts/arc-layout';

const palette: GraphPalette = {
	node: '#111111',
	selected: '#222222',
	edge: '#333333',
	mutedNode: '#555555',
	mutedEdge: '#666666',
	label: '#777777',
	labelBackground: 'rgba(0, 0, 0, 0.8)',
};

describe('ArcLayout', () => {
	it('places nodes in stable label order along one axis', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);

		await new ArcLayout().apply(graph);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({ x: 0, y: -72 });
		expect(graph.getNodeAttributes('B.md')).toMatchObject({ x: 0, y: 0 });
		expect(graph.getNodeAttributes('C.md')).toMatchObject({ x: 0, y: 72 });
	});

	it('splits visible links into arc segments', async () => {
		const graph = new GraphologyAdapter(
			palette,
			[],
			[
				{
					id: 'styled',
					field: 'relation',
					value: 'leads-to',
					color: '#ff0000',
					size: 3,
					lineStyle: 'dashed',
					label: 'Next',
					showLabel: true,
					hidden: false,
				},
			],
		).fromProjection(projection);

		await new ArcLayout().apply(graph);

		expect(graph.hasEdge('A-to-C')).toBe(false);
		expect(graph.hasNode('__arc-bend__A-to-C__4')).toBe(true);
		expect(
			graph.getNodeAttribute('__arc-bend__A-to-C__4', 'x'),
		).toBeGreaterThan(0);
		expect(graph.getEdgeAttribute('A-to-C__arc_segment_1', 'type')).toBe(
			'dashed',
		);
		expect(graph.getEdgeAttribute('A-to-C__arc_segment_9', 'type')).toBe(
			'dashed-arrow',
		);
		expect(
			graph
				.mapEdges((_edge, attributes) => attributes.label)
				.filter(Boolean),
		).toEqual(['Next']);
	});

	it('creates right-facing semicircle points from source to target', () => {
		const points = createArcPoints(-20, 20);
		const midpoint = points[Math.floor(points.length / 2)];

		expect(points[0]?.x).toBeCloseTo(0);
		expect(points[0]?.y).toBe(-20);
		expect(points.at(-1)?.x).toBeCloseTo(0);
		expect(points.at(-1)?.y).toBe(20);
		expect(midpoint?.x).toBeGreaterThan(0);
	});

	it('supports left, up, and down arc directions', async () => {
		const leftPoints = createArcPoints(-20, 20, 0, 'left');
		const upPoints = createArcPoints(-20, 20, 0, 'up');
		const downPoints = createArcPoints(-20, 20, 0, 'down');
		const leftMidpoint = leftPoints[Math.floor(leftPoints.length / 2)];
		const upMidpoint = upPoints[Math.floor(upPoints.length / 2)];
		const downMidpoint = downPoints[Math.floor(downPoints.length / 2)];

		expect(leftMidpoint?.x).toBeLessThan(0);
		expect(upMidpoint?.y).toBeLessThan(0);
		expect(downMidpoint?.y).toBeGreaterThan(0);

		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		await new ArcLayout(1, 'up').apply(graph);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({ x: -72, y: 0 });
		expect(graph.getNodeAttributes('B.md')).toMatchObject({ x: 0, y: 0 });
		expect(graph.getNodeAttributes('C.md')).toMatchObject({ x: 72, y: 0 });
	});
});

const projection: GraphProjection = {
	nodes: [
		{
			id: 'C.md',
			path: 'C.md',
			title: 'C',
			folder: '',
			domains: [],
			tags: [],
		},
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
			id: 'A-to-C',
			source: 'A.md',
			target: 'C.md',
			relation: 'leads-to',
			directed: true,
			sourcePath: 'A.md',
			sourceField: 'leads-to',
		},
	],
	rootIds: new Set(['A.md']),
};
