import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import type { GraphProjection } from '../core/types';
import {
	assignParallelEdgeLanes,
	getCanonicalParallelLane,
	getParallelLane,
} from '../graph/model/parallel-edges';
import { GraphologyAdapter } from '../graph/model/graphology-adapter';
import {
	applyParallelDirectEdges,
	createParallelDirectRoute,
	offsetParallelFlowRoute,
	offsetParallelPolyline,
	syncParallelDirectEdgeRoutes,
} from '../layouts/parallel-routes';
import { applyOrthogonalFlowEdges } from '../layouts/elk-flow-layout';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';
import {
	createParallelCanvasRoute,
	createParallelCanvasRouteFromPolyline,
	distanceToPolyline,
} from '../graph/renderers/sigma/sigma-parallel-edge-layer';
import { isCanvasParallelEdge } from '../graph/renderers/sigma/sigma-parallel-edge-policy';
import { resolveEdgeVisualMetrics } from '../graph/renderers/sigma/sigma-edge-visual-metrics';

function edgeAttributes(relation: string): RuntimeEdgeAttributes {
	return {
		relation,
		type: 'line',
		size: 1,
		color: '#000000',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
		arrowStyle: 'filled',
	};
}

function nodeAttributes(): RuntimeNodeAttributes {
	return {
		label: '',
		x: 0,
		y: 0,
		size: 7,
		color: '#000000',
		path: '',
		folder: '',
		domains: [],
		tags: [],
	};
}

describe('parallel edge lanes', () => {
	it('annotates mixed projection edges and separates Flow corridors', () => {
		const projection: GraphProjection = {
			nodes: [
				{
					id: 'A',
					path: 'A.md',
					title: 'A',
					folder: '',
					domains: [],
					tags: [],
				},
				{
					id: 'B',
					path: 'B.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [
				{
					id: 'pre',
					source: 'A',
					target: 'B',
					relation: 'pre',
					directed: true,
					sourcePath: 'A.md',
					sourceField: 'pre',
				},
				{
					id: 'related',
					source: 'B',
					target: 'A',
					relation: 'related',
					directed: false,
					sourcePath: 'B.md',
					sourceField: 'related',
				},
			],
			rootIds: new Set(['A']),
		};
		const graph = new GraphologyAdapter({
			node: '#111111',
			selected: '#222222',
			edge: '#333333',
			mutedNode: '#555555',
			mutedEdge: '#666666',
			label: '#777777',
			labelBackground: 'rgba(0, 0, 0, 0.8)',
		}).fromProjection(projection);
		// Reverse horizontal placement models an RL Flow chart.
		graph.mergeNodeAttributes('A', { x: 100, y: 0 });
		graph.mergeNodeAttributes('B', { x: 0, y: 0 });

		expect(graph.getEdgeAttribute('pre', 'parallelCount')).toBe(2);
		expect(graph.getEdgeAttribute('related', 'parallelCount')).toBe(2);

		applyOrthogonalFlowEdges(graph);

		const parallelBendY = graph
			.nodes()
			.filter((nodeId) => nodeId.includes('__flow-bend__'))
			.map((nodeId) => graph.getNodeAttribute(nodeId, 'y'));
		expect(new Set(parallelBendY).size).toBeGreaterThan(1);
		for (const edge of graph.edges()) {
			const source = graph.getNodeAttributes(graph.source(edge));
			const target = graph.getNodeAttributes(graph.target(edge));
			expect(
				Math.abs(source.x - target.x) < 0.001 ||
					Math.abs(source.y - target.y) < 0.001,
			).toBe(true);
		}
		const arrowEdge = graph
			.edges()
			.find((edge) => graph.getEdgeAttribute(edge, 'type') === 'arrow');
		expect(arrowEdge).toBeDefined();
		const arrowSource = graph.source(arrowEdge!);
		const arrowTarget = graph.target(arrowEdge!);
		const arrowDx = Math.abs(
			graph.getNodeAttribute(arrowTarget, 'x') -
				graph.getNodeAttribute(arrowSource, 'x'),
		);
		const arrowDy = Math.abs(
			graph.getNodeAttribute(arrowTarget, 'y') -
				graph.getNodeAttribute(arrowSource, 'y'),
		);
		expect(arrowDx).toBeGreaterThan(arrowDy);
		expect(graph.getEdgeAttribute(arrowEdge!, 'flowArrowSegment')).toBe(
			true,
		);
	});

	it('groups directed and undirected edges by unordered endpoints', () => {
		const graph: RuntimeGraph = new Graph({ multi: true, type: 'mixed' });
		graph.addNode('A', nodeAttributes());
		graph.addNode('B', nodeAttributes());
		graph.addDirectedEdgeWithKey('pre', 'A', 'B', edgeAttributes('pre'));
		graph.addUndirectedEdgeWithKey(
			'related',
			'B',
			'A',
			edgeAttributes('related'),
		);

		assignParallelEdgeLanes(graph);

		expect(graph.getEdgeAttribute('pre', 'parallelCount')).toBe(2);
		expect(graph.getEdgeAttribute('related', 'parallelCount')).toBe(2);
		expect(graph.getEdgeAttribute('pre', 'parallelLane')).toBe(-0.5);
		expect(graph.getEdgeAttribute('related', 'parallelLane')).toBe(0.5);
		expect(graph.getEdgeAttribute('pre', 'parallelDirection')).toBe(1);
		expect(graph.getEdgeAttribute('related', 'parallelDirection')).toBe(-1);
	});

	it('keeps lane assignment deterministic when input edge order changes', () => {
		const createGraph = (reverse: boolean) => {
			const graph: RuntimeGraph = new Graph({
				multi: true,
				type: 'mixed',
			});
			graph.addNode('A', nodeAttributes());
			graph.addNode('B', nodeAttributes());
			const add = (id: string, relation: string) =>
				graph.addDirectedEdgeWithKey(
					id,
					'A',
					'B',
					edgeAttributes(relation),
				);
			if (reverse) {
				add('related-edge', 'related');
				add('pre-edge', 'pre');
			} else {
				add('pre-edge', 'pre');
				add('related-edge', 'related');
			}
			assignParallelEdgeLanes(graph);
			return graph;
		};

		const first = createGraph(false);
		const second = createGraph(true);
		expect(first.getEdgeAttribute('pre-edge', 'parallelLane')).toBe(
			second.getEdgeAttribute('pre-edge', 'parallelLane'),
		);
		expect(first.getEdgeAttribute('related-edge', 'parallelLane')).toBe(
			second.getEdgeAttribute('related-edge', 'parallelLane'),
		);
	});

	it('converts lane to canonical orientation for reverse routes', () => {
		expect(
			getCanonicalParallelLane({
				parallelLane: 0.5,
				parallelCount: 2,
				parallelDirection: -1,
			}),
		).toBe(-0.5);
		expect(getParallelLane({ parallelLane: 0.5, parallelCount: 1 })).toBe(
			0,
		);
	});
});

describe('parallel edge visual metrics', () => {
	it('matches Sigma full-width geometry across size and zoom ranges', () => {
		for (const size of [0.5, 1, 2, 4]) {
			for (const cameraRatio of [0.25, 0.5, 1, 2, 4]) {
				const metrics = resolveEdgeVisualMetrics({
					edgeSize: size,
					arrowSize: 1,
					arrowStyle: 'filled',
					lineStyle: 'solid',
					scaleSize: (value) => value / Math.sqrt(cameraRatio),
					minEdgeThickness: 1.7,
				});
				const expectedLineWidth = Math.max(
					size / Math.sqrt(cameraRatio),
					1.7,
				);

				expect(metrics.nominalLineWidth).toBeCloseTo(
					expectedLineWidth,
				);
				expect(metrics.lineWidth).toBeCloseTo(expectedLineWidth);
				expect(metrics.arrowLength).toBeCloseTo(
					expectedLineWidth * 2.5,
				);
				expect(metrics.arrowHalfWidth).toBeCloseTo(expectedLineWidth);
			}
		}
	});

	it('matches Sigma feathered ink coverage across pixel ratios', () => {
		for (const pixelRatio of [1, 1.5, 2, 3]) {
			const metrics = resolveEdgeVisualMetrics({
				edgeSize: 2,
				arrowSize: 1,
				arrowStyle: 'filled',
				lineStyle: 'solid',
				scaleSize: (size) => size,
				minEdgeThickness: 1.7,
				antiAliasingFeather: 1,
				pixelRatio,
			});

			expect(metrics.nominalLineWidth).toBe(2);
			expect(metrics.lineWidth).toBeCloseTo(2 - 1 / pixelRatio);
			// Arrow and lane geometry remain based on nominal width.
			expect(metrics.arrowLength).toBe(5);
			expect(metrics.arrowHalfWidth).toBe(2);
			expect(metrics.laneStep).toBe(5);
		}
	});

	it('applies Sigma zoom scaling and minimum thickness consistently', () => {
		const metrics = resolveEdgeVisualMetrics({
			edgeSize: 1,
			arrowSize: 1,
			arrowStyle: 'filled',
			lineStyle: 'dashed',
			scaleSize: (size) => size / 2,
			minEdgeThickness: 1.7,
		});

		expect(metrics.lineWidth).toBe(1.7);
		expect(metrics.arrowLength).toBe(4.25);
		expect(metrics.arrowHalfWidth).toBe(1.7);
		expect(metrics.dashPattern).toEqual([5, 3.5]);
		expect(metrics.laneStep).toBe(4.25);
		expect(metrics.hitWidth).toBe(6);
	});

	it('clamps lane growth while keeping hit width independent', () => {
		const metrics = resolveEdgeVisualMetrics({
			edgeSize: 8,
			arrowSize: 1,
			arrowStyle: 'chevron',
			lineStyle: 'solid',
			scaleSize: (size) => size / 2,
			minEdgeThickness: 1.7,
		});

		expect(metrics.lineWidth).toBe(4);
		expect(metrics.arrowLength).toBe(9);
		expect(metrics.arrowHalfWidth).toBe(5.5);
		expect(metrics.dashPattern).toEqual([]);
		expect(metrics.laneStep).toBe(8);
		expect(metrics.hitWidth).toBe(6);
	});
});

describe('parallel route geometry', () => {
	it('creates compact pixel lanes with axis-aligned endpoint stubs', () => {
		const route = createParallelCanvasRoute(
			{ x: 20, y: 40 },
			{ x: 220, y: 100 },
			10,
			12,
			3,
			{ x: 1, y: 0 },
		);

		expect(route?.points.length).toBeGreaterThan(2);
		expect(route?.arrowDirection).toEqual({ x: 1, y: 0 });
		expect(route?.points[0]?.x).toBeGreaterThan(20);
		expect(route?.points.at(-1)?.x).toBeLessThan(220);
		expect(route?.points[0]?.x).toBeCloseTo(30);
		expect(route?.points.at(-1)?.x).toBeCloseTo(208);
		expect(route?.points[0]?.y).toBeCloseTo(40);
		expect(route?.points.at(-1)?.y).toBeCloseTo(100);
		// Lane separation starts after the side ports, outside the node circles.
		expect(route?.points.some((point) => point.y > 40)).toBe(true);
		expect(route?.points.every(isAxisAlignedSegment)).toBe(true);
	});

	it('keeps ELK-shaped parallel routes axis-aligned at every segment', () => {
		const route = createParallelCanvasRouteFromPolyline(
			[
				{ x: 20, y: 40 },
				{ x: 80, y: 40 },
				{ x: 80, y: 100 },
				{ x: 220, y: 100 },
			],
			{ x: 20, y: 40 },
			{ x: 220, y: 100 },
			10,
			12,
			3,
			{ x: 1, y: 0 },
		);

		expect(route).toBeDefined();
		expect(route?.points.every(isAxisAlignedSegment)).toBe(true);
		expect(route?.arrowDirection).toEqual({ x: 1, y: 0 });
	});

	it('preserves rounded corners when offsetting a parallel Flow route', () => {
		const route = createParallelCanvasRouteFromPolyline(
			[
				{ x: 20, y: 40 },
				{ x: 70, y: 40 },
				{ x: 78, y: 42 },
				{ x: 86, y: 48 },
				{ x: 92, y: 56 },
				{ x: 94, y: 64 },
				{ x: 94, y: 100 },
				{ x: 220, y: 100 },
			],
			{ x: 20, y: 40 },
			{ x: 220, y: 100 },
			10,
			12,
			3,
			{ x: 1, y: 0 },
			true,
		);

		expect(route).toBeDefined();
		expect(
			route!.points.some(
				(point, index) =>
					index > 0 &&
						Math.abs(point.x - route!.points[index - 1]!.x) > 0.001 &&
						Math.abs(point.y - route!.points[index - 1]!.y) > 0.001,
			),
		).toBe(true);
		expect(route?.arrowDirection).toEqual({ x: 1, y: 0 });
	});

	it('keeps Curve parallel endpoints smooth and flow-axis aligned', () => {
		const route = createParallelCanvasRouteFromPolyline(
			[
				{ x: 20, y: 40 },
				{ x: 54, y: 56 },
				{ x: 92, y: 42 },
				{ x: 140, y: 70 },
				{ x: 220, y: 100 },
			],
			{ x: 20, y: 40 },
			{ x: 220, y: 100 },
			10,
			12,
			3,
			{ x: 1, y: 0 },
			'curve',
		);

		expect(route).toBeDefined();
		expect(route?.arrowDirection).toEqual({ x: 1, y: 0 });
		expect(route?.points[0]?.y).toBeCloseTo(40);
		expect(route?.points.at(-1)?.y).toBeCloseTo(100);
		expect(
			route!.points.some(
				(point, index) =>
					index > 0 &&
					(Math.abs(point.x - route!.points[index - 1]!.x) > 0.001 &&
						Math.abs(
							point.y - route!.points[index - 1]!.y,
						) > 0.001),
			),
		).toBe(true);
	});

	it('keeps vertical Flow directions axis-aligned too', () => {
		const route = createParallelCanvasRoute(
			{ x: 40, y: 20 },
			{ x: 100, y: 220 },
			10,
			12,
			-3,
			{ x: 0, y: 1 },
		);

		expect(route?.points.every(isAxisAlignedSegment)).toBe(true);
		expect(route?.arrowDirection).toEqual({ x: 0, y: 1 });
		expect(route?.points[0]?.x).toBeCloseTo(40);
		expect(route?.points.at(-1)?.x).toBeCloseTo(100);
	});

	it('supports precise polyline hit testing', () => {
		const route = createParallelCanvasRoute(
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			5,
			5,
			4,
			{ x: 1, y: 0 },
		);

		expect(distanceToPolyline({ x: 50, y: 5 }, route!.points)).toBe(1);
		expect(distanceToPolyline({ x: 50, y: 30 }, route!.points)).toBe(26);
	});

	it('moves only non-loop parallel edges to the Canvas layer', () => {
		const attributes = {
			...edgeAttributes('generic'),
			parallelCount: 2,
		};
		expect(isCanvasParallelEdge(attributes, ['A', 'B'])).toBe(true);
		expect(isCanvasParallelEdge(attributes, ['A', 'A'])).toBe(false);
		expect(
			isCanvasParallelEdge({ ...attributes, parallelCount: 1 }, [
				'A',
				'B',
			]),
		).toBe(false);
		expect(
			isCanvasParallelEdge(
				{ ...attributes, parallelRouteOwner: 'layout' },
				['A', 'B'],
			),
		).toBe(false);
		expect(
			isCanvasParallelEdge(
				{ ...attributes, parallelRouteOwner: 'canvas' },
				['A', 'B'],
			),
		).toBe(true);
	});

	it('routes direct parallel edges through compact hidden bends', () => {
		const graph: RuntimeGraph = new Graph({ multi: true, type: 'mixed' });
		graph.addNode('A', { ...nodeAttributes(), x: 0, y: 0 });
		graph.addNode('B', { ...nodeAttributes(), x: 100, y: 0 });
		graph.addDirectedEdgeWithKey(
			'first',
			'A',
			'B',
			edgeAttributes('first'),
		);
		graph.addDirectedEdgeWithKey(
			'second',
			'A',
			'B',
			edgeAttributes('second'),
		);
		assignParallelEdgeLanes(graph);

		const expected = createParallelDirectRoute(
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			7,
			7,
			graph.getEdgeAttributes('first'),
		);
		applyParallelDirectEdges(graph);

		expect(graph.hasEdge('first')).toBe(false);
		expect(graph.order).toBe(6);
		expect(graph.size).toBe(6);
		expect(expected).toHaveLength(4);
		const firstSegments = graph
			.edges()
			.filter((edge) => edge.startsWith('first__segment_'))
			.sort();
		expect(firstSegments).toHaveLength(3);
		const firstBend = graph.target(firstSegments[0]!);
		const secondBend = graph.source(firstSegments[2]!);
		expect(graph.getNodeAttribute(firstBend, 'isBend')).toBe(true);
		expect(graph.getNodeAttribute(secondBend, 'isBend')).toBe(true);
		expect(graph.getNodeAttribute(firstBend, 'y')).toBe(
			graph.getNodeAttribute(secondBend, 'y'),
		);
		expect(graph.getEdgeAttribute(firstSegments[1]!, 'type')).toBe('arrow');
		expect(graph.getEdgeAttribute(firstSegments[1]!, 'label')).toBe('');

		const initialBendY = graph.getNodeAttribute(firstBend, 'y');
		graph.mergeNodeAttributes('A', { x: 0, y: 20 });
		syncParallelDirectEdgeRoutes(graph);
		const moved = createParallelDirectRoute(
			{ x: 0, y: 20 },
			{ x: 100, y: 0 },
			7,
			7,
			graph.getEdgeAttributes(firstSegments[1]!),
		);
		expect(graph.getNodeAttribute(firstBend, 'y')).toBeCloseTo(moved[1]!.y);
		expect(graph.getNodeAttribute(firstBend, 'y')).not.toBe(initialBendY);
	});

	it('adds orthogonal branches and leaves node endpoints unchanged', () => {
		const route = offsetParallelFlowRoute(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 80 },
			],
			{ x: 0, y: 0 },
			{ x: 100, y: 80 },
			{ parallelLane: 0.5, parallelCount: 2, parallelDirection: 1 },
		);

		expect(route[0]).toEqual({ x: 0, y: 0 });
		expect(route.at(-1)).toEqual({ x: 100, y: 80 });
		expect(route.some((point) => point.y === 1.5)).toBe(true);
	});

	it('keeps reverse routes on opposite corridors', () => {
		const forward = offsetParallelFlowRoute(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
			],
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ parallelLane: -0.5, parallelCount: 2, parallelDirection: 1 },
		);
		const reverse = offsetParallelFlowRoute(
			[
				{ x: 100, y: 0 },
				{ x: 0, y: 0 },
			],
			{ x: 100, y: 0 },
			{ x: 0, y: 0 },
			{ parallelLane: 0.5, parallelCount: 2, parallelDirection: -1 },
		);

		expect(forward[1]?.y).toBeLessThan(0);
		expect(reverse[1]?.y).toBeGreaterThan(0);
	});

	it('tapers sampled curve offset to zero at both endpoints', () => {
		const points = offsetParallelPolyline(
			[
				{ x: 0, y: 0 },
				{ x: 50, y: 0 },
				{ x: 100, y: 0 },
			],
			10,
		);

		expect(points[0]).toEqual({ x: 0, y: 0 });
		expect(points.at(-1)).toEqual({ x: 100, y: 0 });
		expect(points[1]?.y).toBe(10);
	});
});

function isAxisAlignedSegment(
	point: { x: number; y: number },
	index: number,
	points?: readonly { x: number; y: number }[],
): boolean {
	const next = points?.[index + 1];
	if (!next) return true;
	return (
		Math.abs(point.x - next.x) < 0.001 || Math.abs(point.y - next.y) < 0.001
	);
}
