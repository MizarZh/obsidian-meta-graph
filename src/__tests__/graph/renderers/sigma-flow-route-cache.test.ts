import Graph from 'graphology';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { SigmaParallelEdgeLayer } from '@/graph/renderers/sigma/sigma-parallel-edge-layer';

vi.mock('sigma', () => ({ default: class {} }));

describe('Sigma Flow route cache', () => {
	it.each(['curve', 'rounded', 'orthogonal'])(
		'preserves %s routes when playback reveals initially hidden edges',
		(kind) => {
			const graph = new Graph();
			graph.addNode('a');
			graph.addNode('b');
			const route = [
				{ x: 0, y: 0 },
				{ x: 20, y: 40 },
				{ x: 100, y: 50 },
			];
			graph.addEdgeWithKey('edge', 'a', 'b', {
				hidden: true,
				logicalEdgeId: 'logical',
				flowRouteKind: kind,
				flowRouteDirection: 'RIGHT',
				flowRoute: route,
			});
			// Exercise the actual persistent cache without constructing a canvas.
			const layer = Object.create(SigmaParallelEdgeLayer.prototype) as {
				getFlowRouteIndex(
					graph: RuntimeGraph,
				): Map<string, { kind: string; route: unknown }>;
			};
			const initial = layer.getFlowRouteIndex(graph as RuntimeGraph);
			expect(initial.get('logical')).toMatchObject({ kind, route });
			expect(graph.getEdgeAttribute('edge', 'hidden')).toBe(true);
			graph.setEdgeAttribute('edge', 'hidden', false);
			const revealed = layer.getFlowRouteIndex(graph as RuntimeGraph);
			expect(revealed).toBe(initial);
			expect(revealed.get('logical')).toMatchObject({ kind, route });
			graph.setEdgeAttribute('edge', 'hidden', true);
			expect(layer.getFlowRouteIndex(graph as RuntimeGraph)).toBe(
				initial,
			);
		},
	);
});
