import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import type { GraphProjection } from '@/core/types';
import {
	assignParallelEdgeLanes,
	getCanonicalParallelLane,
	getParallelLane,
} from '@/graph/model/parallel-edges';
import { GraphologyAdapter } from '@/graph/model/graphology-adapter';
import {
	offsetParallelFlowRoute,
	offsetParallelPolyline,
} from '@/layouts/parallel-routes';
import { applyOrthogonalFlowEdges } from '@/layouts/elk-flow-layout';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import {
	createParallelCanvasRoute,
	createParallelCanvasRouteFromPolyline,
	distanceToPolyline,
	getEdgeFocusPriority,
	orderNativeEdgeSegments,
} from '@/graph/renderers/sigma/sigma-parallel-edge-layer';
import { isCanvasParallelEdge } from '@/graph/renderers/sigma/sigma-parallel-edge-policy';
import { resolveEdgeVisualMetrics } from '@/graph/renderers/sigma/sigma-edge-visual-metrics';
import { planarZoomToSizeRatio } from '@/graph/renderers/planar-viewport-scale';

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
	it('recomputes Canvas routes after movement without changing logical graph topology', () => {
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
		const routeFor = (edgeId: string) =>
			createParallelCanvasRoute(
				graph.getNodeAttributes('A'),
				graph.getNodeAttributes('B'),
				7,
				7,
				getCanonicalParallelLane(graph.getEdgeAttributes(edgeId)) * 4,
			);
		const initial = routeFor('first');
		expect(initial).toBeDefined();
		expect(initial?.points).not.toEqual(routeFor('second')?.points);
		const originalPoints = initial?.points.map((point) => ({ ...point }));
		graph.mergeNodeAttributes('A', { x: 0, y: 20 });
		const moved = routeFor('first');
		expect(moved).toBeDefined();
		expect(moved?.points).not.toEqual(initial?.points);
		expect(initial?.points).toEqual(originalPoints);
		const start = moved!.points[0]!;
		const end = moved!.points.at(-1)!;
		expect(Math.hypot(start.x, start.y - 20)).toBeCloseTo(7);
		expect(Math.hypot(end.x - 100, end.y)).toBeCloseTo(7);
		expect(graph.nodes()).toEqual(['A', 'B']);
		expect(graph.edges()).toEqual(['first', 'second']);
	});
	it('matches Sigma physical full-width geometry across size and zoom ranges', () => {
		for (const size of [0.5, 1, 2, 4]) {
			for (const cameraRatio of [0.25, 0.5, 1, 2, 4]) {
				const metrics = resolveEdgeVisualMetrics({
					edgeSize: size,
					arrowSize: 1,
					arrowStyle: 'filled',
					lineStyle: 'solid',
					scaleSize: (value) =>
						value / planarZoomToSizeRatio(cameraRatio),
					minEdgeThickness: 1.7,
				});
				const expectedLineWidth = Math.max(
					size / planarZoomToSizeRatio(cameraRatio),
					1.7,
				);

				expect(metrics.nominalLineWidth).toBeCloseTo(expectedLineWidth);
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

	it('keeps focused arrow geometry at its base edge size', () => {
		const metrics = resolveEdgeVisualMetrics({
			edgeSize: 3,
			arrowEdgeSize: 1,
			arrowSize: 1,
			arrowStyle: 'filled',
			lineStyle: 'solid',
			scaleSize: (size) => size,
			minEdgeThickness: 1.7,
		});

		expect(metrics.lineWidth).toBe(3);
		expect(metrics.arrowLength).toBe(4.25);
		expect(metrics.arrowHalfWidth).toBe(1.7);
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

	it('clips Curve parallel endpoints on the route with tangent arrows', () => {
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
		expect(
			Math.hypot(route!.points[0]!.x - 20, route!.points[0]!.y - 40),
		).toBeCloseTo(10);
		expect(
			Math.hypot(
				route!.points.at(-1)!.x - 220,
				route!.points.at(-1)!.y - 100,
			),
		).toBeCloseTo(12);
		const end = route!.points.at(-1)!;
		const previous = route!.points.at(-2)!;
		const length = Math.hypot(end.x - previous.x, end.y - previous.y);
		expect(route!.arrowDirection.x).toBeCloseTo(
			(end.x - previous.x) / length,
		);
		expect(route!.arrowDirection.y).toBeCloseTo(
			(end.y - previous.y) / length,
		);
		expect(
			route!.points.some(
				(point, index) =>
					index > 0 &&
					Math.abs(point.x - route!.points[index - 1]!.x) > 0.001 &&
					Math.abs(point.y - route!.points[index - 1]!.y) > 0.001,
			),
		).toBe(true);
	});

	it('clips dense curve samples outside nodes without endpoint backtracking', () => {
		const base = Array.from({ length: 41 }, (_, i) => ({
			x: i * 5,
			y: 60 * (3 * (i / 40) ** 2 - 2 * (i / 40) ** 3),
		}));
		for (const lane of [-4, 4]) {
			const route = createParallelCanvasRouteFromPolyline(
				base,
				base[0]!,
				base.at(-1)!,
				15,
				15,
				lane,
				{ x: 1, y: 0 },
				'curve',
			)!;
			expect(
				Math.hypot(route.points[0]!.x, route.points[0]!.y),
			).toBeCloseTo(15);
			expect(
				Math.hypot(
					route.points.at(-1)!.x - 200,
					route.points.at(-1)!.y - 60,
				),
			).toBeCloseTo(15);
			for (let i = 1; i < route.points.length; i++) {
				expect(route.points[i]!.x).toBeGreaterThanOrEqual(
					route.points[i - 1]!.x,
				);
			}
			for (const point of route.points) {
				expect(Math.hypot(point.x, point.y)).toBeGreaterThanOrEqual(
					15 - 1e-9,
				);
				expect(
					Math.hypot(point.x - 200, point.y - 60),
				).toBeGreaterThanOrEqual(15 - 1e-9);
			}
		}
	});

	it('preserves short and sparse curve geometry across zoom levels', () => {
		for (const base of [
			[
				{ x: 0, y: 0 },
				{ x: 20, y: 10 },
				{ x: 40, y: 20 },
			],
			[
				{ x: 0, y: 0 },
				{ x: 20, y: 2 },
				{ x: 40, y: 30 },
				{ x: 60, y: 70 },
				{ x: 80, y: 98 },
				{ x: 100, y: 100 },
			],
		]) {
			for (const lane of [-4, 0, 4]) {
				const create = (zoom: number) => {
					const points = base.map((p) => ({
						x: p.x * zoom,
						y: p.y * zoom,
					}));
					return createParallelCanvasRouteFromPolyline(
						points,
						points[0]!,
						points.at(-1)!,
						5 * zoom,
						5 * zoom,
						lane * zoom,
						{ x: 1, y: 0 },
						'curve',
					)!;
				};
				const reference = create(1);
				for (const zoom of [0.25, 0.5, 0.99, 1.01, 2, 4]) {
					const route = create(zoom);
					expect(route.points).toHaveLength(reference.points.length);
					route.points.forEach((point, i) => {
						expect(point.x / zoom).toBeCloseTo(
							reference.points[i]!.x,
						);
						expect(point.y / zoom).toBeCloseTo(
							reference.points[i]!.y,
						);
					});
				}
			}
		}
	});

	it('retains the curve interior when screen-sized nodes cover more samples', () => {
		const base = Array.from({ length: 41 }, (_, i) => ({
			x: i * 5,
			y: 60 * (3 * (i / 40) ** 2 - 2 * (i / 40) ** 3),
		}));
		for (const zoom of [0.25, 0.5, 1, 2, 4]) {
			const points = base.map((p) => ({ x: p.x * zoom, y: p.y * zoom }));
			const route = createParallelCanvasRouteFromPolyline(
				points,
				points[0]!,
				points.at(-1)!,
				8,
				8,
				0,
				{ x: 1, y: 0 },
				'curve',
			)!;
			for (const point of route.points)
				expect(distanceToPolyline(point, points)).toBeLessThan(1e-8);
			expect(route.points).toContainEqual(points[20]);
		}
	});

	it('omits curves entirely covered by a node', () => {
		expect(
			createParallelCanvasRouteFromPolyline(
				[
					{ x: 0, y: 0 },
					{ x: 10, y: 5 },
				],
				{ x: 0, y: 0 },
				{ x: 10, y: 5 },
				20,
				20,
				0,
				{ x: 1, y: 0 },
				'curve',
			),
		).toBeUndefined();
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

	it('keeps focused native and Canvas routes above muted routes', () => {
		const state = {
			activeHoverNodeId: 'focus',
			selectedEdgeId: 'selected',
		};
		const muted = { edgeId: 'muted', source: 'A', target: 'B' };
		const connected = { edgeId: 'connected', source: 'focus', target: 'B' };
		const routed = {
			edgeId: 'routed',
			source: '__bend__1',
			target: '__bend__2',
			logicalSource: 'focus',
			logicalTarget: 'B',
		};
		const hovered = { edgeId: 'hovered', source: 'A', target: 'B' };
		const selected = { edgeId: 'selected', source: 'A', target: 'B' };
		const pinnedState = {
			activeHoverNodeId: 'focus',
			pinnedNodeId: 'focus',
			selectedEdgeId: 'selected',
		};

		expect(getEdgeFocusPriority(muted, state)).toBe(0);
		expect(getEdgeFocusPriority(connected, state)).toBe(1);
		expect(getEdgeFocusPriority(routed, state)).toBe(1);
		expect(getEdgeFocusPriority(hovered, state, 'hovered')).toBe(2);
		expect(getEdgeFocusPriority(selected, state)).toBe(3);
		expect(getEdgeFocusPriority(hovered, pinnedState, 'hovered')).toBe(0);
		expect(getEdgeFocusPriority(connected, pinnedState, 'connected')).toBe(
			2,
		);
	});

	it('orders routed native segments into one continuous logical path', () => {
		const ordered = orderNativeEdgeSegments(
			[
				{
					runtimeEdgeId: 'edge__segment_3',
					source: 'bend-2',
					target: 'B',
				},
				{
					runtimeEdgeId: 'edge__segment_1',
					source: 'A',
					target: 'bend-1',
				},
				{
					runtimeEdgeId: 'edge__segment_2',
					source: 'bend-1',
					target: 'bend-2',
				},
			],
			'A',
			'B',
		);

		expect(ordered.map((segment) => segment.runtimeEdgeId)).toEqual([
			'edge__segment_1',
			'edge__segment_2',
			'edge__segment_3',
		]);
		expect(ordered.every((segment) => !segment.reversed)).toBe(true);
	});

	it('reverses undirected segment orientation when needed to join the route', () => {
		const ordered = orderNativeEdgeSegments(
			[
				{
					runtimeEdgeId: 'edge__segment_2',
					source: 'bend',
					target: 'A',
				},
				{
					runtimeEdgeId: 'edge__segment_1',
					source: 'B',
					target: 'bend',
				},
			],
			'A',
			'B',
		);

		expect(ordered.map((segment) => segment.runtimeEdgeId)).toEqual([
			'edge__segment_2',
			'edge__segment_1',
		]);
		expect(ordered.map((segment) => segment.reversed)).toEqual([
			true,
			true,
		]);
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
