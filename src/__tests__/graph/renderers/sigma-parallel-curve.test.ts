import { describe, expect, it } from 'vitest';
import { createParallelCurveRoute } from '@/graph/renderers/sigma/sigma-parallel-curve';

describe('Sigma parallel curves', () => {
	it('fans lanes out and attaches at node boundaries with a tangent arrow', () => {
		const a = { x: 0, y: 0 },
			b = { x: 200, y: 0 };
		const left = createParallelCurveRoute(a, b, 10, 20, -5)!;
		const right = createParallelCurveRoute(a, b, 10, 20, 5)!;
		expect(left.points[Math.floor(left.points.length / 2)]!.y).toBeLessThan(
			0,
		);
		expect(
			right.points[Math.floor(right.points.length / 2)]!.y,
		).toBeGreaterThan(0);
		const start = right.points[0]!,
			end = right.points.at(-1)!;
		expect(Math.hypot(start.x, start.y)).toBeCloseTo(10);
		expect(Math.hypot(end.x - 200, end.y)).toBeCloseTo(20);
		expect(right.arrowDirection.x).toBeGreaterThan(0);
		expect(right.arrowDirection.y).toBeLessThan(0);
		for (const p of right.points) {
			expect(p.x).toBeGreaterThanOrEqual(right.bounds.left);
			expect(p.y).toBeLessThanOrEqual(right.bounds.bottom);
		}
	});
	it('preserves physical lane when endpoints and canonical offset reverse', () => {
		const a = { x: 12, y: 23 },
			b = { x: 89, y: 230 };
		const forward = createParallelCurveRoute(a, b, 8, 12, 6)!;
		const reverse = createParallelCurveRoute(b, a, 12, 8, -6)!;
		forward.points.forEach((p, index) => {
			const q = reverse.points[reverse.points.length - 1 - index]!;
			expect(p.x).toBeCloseTo(q.x);
			expect(p.y).toBeCloseTo(q.y);
		});
	});
	it('keeps the central lane straight and rejects coincident/overlapping nodes', () => {
		expect(
			createParallelCurveRoute(
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				5,
				5,
				0,
			)!.points.every((p) => p.y === 0),
		).toBe(true);
		expect(
			createParallelCurveRoute({ x: 0, y: 0 }, { x: 0, y: 0 }, 5, 5, 3),
		).toBeUndefined();
		expect(
			createParallelCurveRoute({ x: 0, y: 0 }, { x: 8, y: 0 }, 5, 5, 3),
		).toBeUndefined();
	});
});
