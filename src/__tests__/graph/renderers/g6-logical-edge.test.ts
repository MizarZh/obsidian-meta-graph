import { describe, expect, it } from 'vitest';
import type { Point, PolylineStyleProps } from '@antv/g6';
import { G6LogicalEdge } from '@/graph/renderers/g6/g6-logical-edge';

class TestEdge extends G6LogicalEdge {
	readPoints(attributes: Required<PolylineStyleProps>): Point[] {
		return this.getControlPoints(attributes);
	}
}

function createEdge(radius: number, polygon = false): TestEdge {
	const edge = Object.create(TestEdge.prototype) as TestEdge;
	const node = (x: number) => ({
		getCenter: (): Point => [x, 0],
		getIntersectPoint: (point: Point): Point => {
			if (polygon) {
				const extent = Math.max(
					Math.abs(point[0] - x),
					Math.abs(point[1]),
				);
				if (extent < radius) return [x, 0];
				return [
					x + ((point[0] - x) * radius) / extent,
					(point[1] * radius) / extent,
				];
			}
			const angle = Math.atan2(point[1], point[0] - x);
			return [x + radius * Math.cos(angle), radius * Math.sin(angle)];
		},
	});
	Object.defineProperties(edge, {
		sourceNode: { value: node(0) },
		targetNode: { value: node(100) },
		getEndpoints: {
			value: () => [
				[0, 0],
				[100, 0],
			],
		},
	});
	return edge;
}

describe('G6 logical route endpoint clipping', () => {
	it('recognizes polygon center fallback for internal bends', () => {
		const attributes = {
			router: false,
			controlPoints: [
				[2, 2],
				[50, 25],
				[98, 2],
			],
		} as Required<PolylineStyleProps>;
		expect(createEdge(10, true).readPoints(attributes)).toEqual([[50, 25]]);
	});
	it.each([0.25, 1, 4])(
		'removes internal bends without changing layout at node size multiplier %s',
		(scale) => {
			const points: Point[] = [
				[0, 0],
				[2, 0],
				[30, 20],
				[70, 20],
				[98, 0],
				[100, 0],
			];
			const attributes = {
				router: false,
				controlPoints: points,
			} as Required<PolylineStyleProps>;
			const original = points.map((point) => [...point]);
			expect(createEdge(10 * scale).readPoints(attributes)).toEqual(
				scale === 4
					? []
					: [
							[30, 20],
							[70, 20],
						],
			);
			expect(points).toEqual(original);
		},
	);

	it('retains external bends and removes newly covered bends when nodes grow', () => {
		const attributes = {
			router: false,
			controlPoints: [
				[15, 0],
				[50, 25],
				[85, 0],
			],
		} as Required<PolylineStyleProps>;
		expect(createEdge(10).readPoints(attributes)).toEqual(
			attributes.controlPoints,
		);
		expect(createEdge(20).readPoints(attributes)).toEqual([[50, 25]]);
	});

	it('handles empty and boundary-coincident control points', () => {
		const edge = createEdge(10);
		for (const points of [
			[],
			[
				[10, 0],
				[90, 0],
			],
		] as Point[][]) {
			expect(
				edge.readPoints({
					router: false,
					controlPoints: points,
				} as Required<PolylineStyleProps>),
			).toEqual([]);
		}
	});
});
