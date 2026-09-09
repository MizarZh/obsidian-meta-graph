import type {
	ParallelCanvasRoute,
	ViewportPoint,
} from './sigma-parallel-edge-layer';

/** Screen-space quadratic lanes. All consumers use the same sampled route. */
export function createParallelCurveRoute(
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	laneOffset: number,
): ParallelCanvasRoute | undefined {
	const dx = target.x - source.x;
	const dy = target.y - source.y;
	const length = Math.hypot(dx, dy);
	if (
		!Number.isFinite(length) ||
		length < 0.001 ||
		length <= sourceRadius + targetRadius
	)
		return undefined;
	const bow = laneOffset * 4;
	const control = {
		x: (source.x + target.x) / 2 - (dy / length) * bow,
		y: (source.y + target.y) / 2 + (dx / length) * bow,
	};
	const direction = (a: ViewportPoint, b: ViewportPoint) => {
		const distance = Math.hypot(b.x - a.x, b.y - a.y);
		return { x: (b.x - a.x) / distance, y: (b.y - a.y) / distance };
	};
	const startDirection = direction(source, control);
	const endDirection = direction(control, target);
	const start = {
		x: source.x + startDirection.x * sourceRadius,
		y: source.y + startDirection.y * sourceRadius,
	};
	const end = {
		x: target.x - endDirection.x * targetRadius,
		y: target.y - endDirection.y * targetRadius,
	};
	// Bound tessellation work; error scales with curvature rather than length.
	const segments = Math.min(
		64,
		Math.max(8, Math.ceil(Math.sqrt(Math.abs(bow) * 4))),
	);
	const points = Array.from({ length: segments + 1 }, (_, i) => {
		const t = i / segments,
			u = 1 - t;
		return {
			x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
			y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
		};
	});
	return {
		points,
		arrowDirection: endDirection,
		bounds: {
			left: Math.min(...points.map((p) => p.x)),
			right: Math.max(...points.map((p) => p.x)),
			top: Math.min(...points.map((p) => p.y)),
			bottom: Math.max(...points.map((p) => p.y)),
		},
	};
}
