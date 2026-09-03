import { describe, expect, it, vi } from 'vitest';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import {
	createSigmaHoverRefreshIndex,
	createSigmaHoverRefreshPlan,
	SigmaHoverRefreshCoordinator,
	type SigmaHoverRefreshState,
} from '../graph/renderers/sigma/sigma-hover-refresh';

describe('Sigma hover refresh planning', () => {
	it('refreshes only the neighborhood delta and incident logical segments', () => {
		const graph = createGraph();
		const index = createSigmaHoverRefreshIndex(graph);
		const plan = createSigmaHoverRefreshPlan(
			graph,
			index,
			hoverState('a', ['a', 'b']),
			hoverState('b', ['a', 'b', 'c']),
		);

		expect(new Set(plan.nodeIds)).toEqual(new Set(['a', 'b', 'c']));
		expect(new Set(plan.edgeIds)).toEqual(new Set(['ab-1', 'ab-2', 'bc']));
		expect(plan.edgeIds).not.toContain('de');
	});

	it('refreshes all visual entries when entering or leaving node focus', () => {
		const graph = createGraph();
		const index = createSigmaHoverRefreshIndex(graph);
		const plan = createSigmaHoverRefreshPlan(
			graph,
			index,
			hoverState(undefined, []),
			hoverState('a', ['a', 'b']),
		);

		expect(new Set(plan.nodeIds)).toEqual(new Set(graph.nodes()));
		expect(new Set(plan.edgeIds)).toEqual(new Set(graph.edges()));
	});

	it('refreshes every runtime segment of changed logical edges', () => {
		const graph = createGraph();
		const index = createSigmaHoverRefreshIndex(graph);
		const plan = createSigmaHoverRefreshPlan(
			graph,
			index,
			{ ...hoverState(undefined, []), edgeId: 'logical-ab' },
			{ ...hoverState(undefined, []), edgeId: 'logical-bc' },
		);

		expect(new Set(plan.edgeIds)).toEqual(new Set(['ab-1', 'ab-2', 'bc']));
	});
});

describe('SigmaHoverRefreshCoordinator', () => {
	it('coalesces multiple changes into one frame using the latest state', () => {
		let pendingFrame: FrameRequestCallback | undefined;
		const frames = {
			requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
				pendingFrame = callback;
				return 7;
			}),
			cancelAnimationFrame: vi.fn(),
		};
		const initial = hoverState(undefined, []);
		const first = hoverState('a', ['a', 'b']);
		const latest = hoverState('b', ['a', 'b', 'c']);
		const apply = vi.fn();
		const coordinator = new SigmaHoverRefreshCoordinator(
			frames,
			initial,
			apply,
		);

		coordinator.schedule(first);
		coordinator.schedule(latest);

		expect(frames.requestAnimationFrame).toHaveBeenCalledOnce();
		pendingFrame?.(0);
		expect(apply).toHaveBeenCalledOnce();
		expect(apply).toHaveBeenCalledWith(initial, latest);
	});
});

function hoverState(
	activeNodeId: string | undefined,
	neighborhood: string[],
): SigmaHoverRefreshState {
	return { activeNodeId, neighborhood: new Set(neighborhood) };
}

function createGraph(): RuntimeGraph {
	const nodes = ['a', 'b', 'c', 'd', 'e'];
	const edges = [
		{
			id: 'ab-1',
			source: 'a',
			target: 'bend-ab',
			logicalEdgeId: 'logical-ab',
			logicalSource: 'a',
			logicalTarget: 'b',
		},
		{
			id: 'ab-2',
			source: 'bend-ab',
			target: 'b',
			logicalEdgeId: 'logical-ab',
			logicalSource: 'a',
			logicalTarget: 'b',
		},
		{
			id: 'bc',
			source: 'b',
			target: 'c',
			logicalEdgeId: 'logical-bc',
			logicalSource: 'b',
			logicalTarget: 'c',
		},
		{
			id: 'de',
			source: 'd',
			target: 'e',
			logicalEdgeId: 'logical-de',
			logicalSource: 'd',
			logicalTarget: 'e',
		},
	];
	return {
		nodes: () => [...nodes],
		edges: () => edges.map((edge) => edge.id),
		forEachEdge: (callback: (...args: unknown[]) => void) => {
			for (const edge of edges) {
				callback(
					edge.id,
					edge,
					edge.source,
					edge.target,
					{},
					{},
					false,
				);
			}
		},
	} as unknown as RuntimeGraph;
}
