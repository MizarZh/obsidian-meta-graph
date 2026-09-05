import Graphology from 'graphology';
import { describe, expect, it } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../../graph/model/graphology-adapter';
import {
	createG6CoordinateSpace,
	MIN_G6_COORDINATE_SPAN,
} from '../../../graph/renderers/g6/g6-coordinate-space';

describe('G6 coordinate space', () => {
	it('conditions compact Free coordinates and preserves exact round trips', () => {
		const graph = createGraph(1, 4);
		const space = createG6CoordinateSpace(graph);
		const left = space.toG6({ x: 1, y: 2 });
		const right = space.toG6({ x: 4, y: 2 });

		expect(right.x - left.x).toBe(MIN_G6_COORDINATE_SPAN);
		expect(space.toGraph(left)).toEqual({ x: 1, y: 2 });
		expect(space.toGraph(right)).toEqual({ x: 4, y: 2 });
	});

	it('does not compress an already well-scaled layout', () => {
		const graph = createGraph(-400, 400);
		const space = createG6CoordinateSpace(graph);

		expect(space.scale).toBe(1);
		expect(space.toG6({ x: 125, y: -75 })).toEqual({ x: 125, y: -75 });
	});
});

function createGraph(left: number, right: number): RuntimeGraph {
	const graph = new Graphology<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>();
	for (const [id, x] of [
		['left', left],
		['right', right],
	] as const) {
		graph.addNode(id, {
			label: id,
			x,
			y: 2,
			size: 8,
			color: '#000000',
			path: `${id}.md`,
			folder: '',
			domains: [],
			tags: [],
		});
	}
	return graph;
}
