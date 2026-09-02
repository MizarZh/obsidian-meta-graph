import { describe, expect, it } from 'vitest';
import type { ChartGroupDefinition, GraphProjection } from '../core/types';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import type { GraphPalette } from '../graph/styles/graph-styles';
import {
	ArcLayout,
	createArcPoints,
	getArcLabelPlacement,
} from '../layouts/arc-layout';
import { isCanvasParallelEdge } from '../graph/renderers/sigma/sigma-parallel-edge-policy';
import {
	normalizeLayoutGroupPadding,
	scaleLayoutGroupPadding,
} from '../layouts/group-geometry';

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

	it('keeps parallel links on layout-owned arcs', async () => {
		const firstEdge = projection.edges[0];
		if (!firstEdge) {
			throw new Error('Arc parallel-edge test requires a base edge.');
		}
		const graph = new GraphologyAdapter(palette).fromProjection({
			...projection,
			edges: [
				firstEdge,
				{
					...firstEdge,
					id: 'A-to-C-related',
					relation: 'related',
					directed: false,
					sourceField: 'related',
				},
			],
		});

		await new ArcLayout(1, 'up').apply(graph);

		const segmentIds = graph
			.edges()
			.filter((edgeId) => edgeId.includes('__arc_segment_'));
		expect(segmentIds.length).toBeGreaterThan(2);
		expect(
			segmentIds.every((edgeId) => {
				const attributes = graph.getEdgeAttributes(edgeId);
				return (
					attributes.parallelRouteOwner === 'layout' &&
					!isCanvasParallelEdge(attributes, [
						graph.source(edgeId),
						graph.target(edgeId),
					])
				);
			}),
		).toBe(true);

		const firstMidpointY = graph.getNodeAttribute(
			'__arc-bend__A-to-C__4',
			'y',
		);
		const secondMidpointY = graph.getNodeAttribute(
			'__arc-bend__A-to-C-related__4',
			'y',
		);
		expect(firstMidpointY).toBeGreaterThan(0);
		expect(secondMidpointY).toBeGreaterThan(0);
		expect(firstMidpointY).not.toBeCloseTo(secondMidpointY);
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
		expect(upMidpoint?.y).toBeGreaterThan(0);
		expect(downMidpoint?.y).toBeLessThan(0);

		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		await new ArcLayout(1, 'up').apply(graph);

		expect(graph.getNodeAttributes('A.md')).toMatchObject({ x: -72, y: 0 });
		expect(graph.getNodeAttributes('B.md')).toMatchObject({ x: 0, y: 0 });
		expect(graph.getNodeAttributes('C.md')).toMatchObject({ x: 72, y: 0 });
		expect(graph.getNodeAttribute('A.md', 'labelRotation')).toBeCloseTo(
			Math.PI / 2,
		);
	});

	it('resolves automatic and mirrored label angles', () => {
		expect(getArcLabelPlacement('right', 'auto')).toEqual({});
		expect(getArcLabelPlacement('up', 'auto').rotation).toBeCloseTo(
			Math.PI / 2,
		);
		expect(getArcLabelPlacement('down', 'auto').rotation).toBeCloseTo(
			-Math.PI / 2,
		);
		expect(getArcLabelPlacement('left', 45)).toMatchObject({
			direction: 1,
		});
		expect(getArcLabelPlacement('left', 45).rotation).toBeCloseTo(
			Math.PI / 4,
		);
		expect(getArcLabelPlacement('right', 45)).toMatchObject({
			direction: -1,
		});
		expect(getArcLabelPlacement('right', 45).rotation).toBeCloseTo(
			-Math.PI / 4,
		);
		expect(getArcLabelPlacement('up', 0)).toEqual({});
	});

	it('sorts nodes by configured field and direction', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);

		await new ArcLayout(1, 'right', 'modified', 'desc').apply(graph);

		expect(graph.getNodeAttributes('C.md')).toMatchObject({ x: 0, y: -72 });
		expect(graph.getNodeAttributes('A.md')).toMatchObject({ x: 0, y: 0 });
		expect(graph.getNodeAttributes('B.md')).toMatchObject({ x: 0, y: 72 });
	});

	it('keeps groups contiguous in group priority order', async () => {
		const graph = new GraphologyAdapter(palette).fromProjection(projection);
		const groups: ChartGroupDefinition[] = [
			group('later-names'),
			group('earlier-names'),
		];
		const layout = new ArcLayout(
			1,
			'right',
			'name',
			'asc',
			'auto',
			groups,
			new Map([
				['C.md', 'later-names'],
				['A.md', 'earlier-names'],
			]),
		);

		await layout.apply(graph);

		expect(graph.getNodeAttribute('C.md', 'y')).toBe(-72);
		expect(graph.getNodeAttribute('A.md', 'y')).toBe(0);
		expect(graph.getNodeAttribute('B.md', 'y')).toBe(72);
		expect(layout.getGroupGeometries().map((item) => item.groupId)).toEqual(
			['later-names', 'earlier-names'],
		);
		expect(
			layout.getGroupGeometries().every((item) => item.halfWidth > 0),
		).toBe(true);
	});

	it('expands both axes of a group frame with padding', async () => {
		const compact = new ArcLayout(
			1,
			'right',
			'name',
			'asc',
			'auto',
			[{ ...group('group-a'), padding: 0 }],
			new Map([['A.md', 'group-a']]),
		);
		const spacious = new ArcLayout(
			1,
			'right',
			'name',
			'asc',
			'auto',
			[{ ...group('group-a'), padding: 5 }],
			new Map([['A.md', 'group-a']]),
		);

		await compact.apply(
			new GraphologyAdapter(palette).fromProjection(projection),
		);
		await spacious.apply(
			new GraphologyAdapter(palette).fromProjection(projection),
		);

		const compactGeometry = compact.getGroupGeometries()[0];
		const spaciousGeometry = spacious.getGroupGeometries()[0];
		expect(spaciousGeometry?.start).toBeLessThan(
			compactGeometry?.start ?? 0,
		);
		expect(spaciousGeometry?.end).toBeGreaterThan(
			compactGeometry?.end ?? 0,
		);
		expect(spaciousGeometry?.halfWidth).toBeGreaterThan(
			compactGeometry?.halfWidth ?? 0,
		);
	});

	it('bounds the 0 to 5 padding control without flattening its range', () => {
		expect(normalizeLayoutGroupPadding(-1)).toBe(0);
		expect(normalizeLayoutGroupPadding(8)).toBe(5);
		expect(scaleLayoutGroupPadding(5)).toBeGreaterThan(
			scaleLayoutGroupPadding(1),
		);
		expect(scaleLayoutGroupPadding(5)).toBeLessThan(1);
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
			id: 'C.md',
			path: 'C.md',
			title: 'C',
			modifiedTime: 3,
			folder: '',
			domains: [],
			tags: [],
		},
		{
			id: 'A.md',
			path: 'A.md',
			title: 'A',
			modifiedTime: 2,
			folder: '',
			domains: [],
			tags: [],
		},
		{
			id: 'B.md',
			path: 'B.md',
			title: 'B',
			modifiedTime: 1,
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
