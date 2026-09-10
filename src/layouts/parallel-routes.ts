import {
	getCanonicalParallelLane,
	type ParallelEdgeRouteAttributes,
} from '@/graph/model/parallel-edges';

export interface RoutePoint {
	x: number;
	y: number;
}

const ROUTE_EPSILON = 0.001;

/**
 * Adds a parallel orthogonal corridor while keeping both node endpoints
 * unchanged. The short perpendicular branches make the route attach to the
 * original node ports instead of ending beside the nodes.
 */
export function offsetParallelFlowRoute(
	route: readonly RoutePoint[],
	source: RoutePoint,
	target: RoutePoint,
	attributes: ParallelEdgeRouteAttributes,
	gap = 3,
): RoutePoint[] {
	const lane = getCanonicalParallelLane(attributes);
	const points = deduplicatePoints([source, ...route, target]);
	if (Math.abs(lane) <= ROUTE_EPSILON || points.length < 2) {
		return points;
	}

	const firstSegment = findFirstSegment(points);
	if (!firstSegment) {
		return points;
	}
	const horizontal = Math.abs(firstSegment.x) >= Math.abs(firstSegment.y);
	const crossOffset = lane * gap;
	// Keep lane ordering tied to the route's actual travel direction. A
	// reverse directed edge has the opposite normal, so the sign must flip
	// before applying the canonical lane; otherwise A -> B and B -> A can
	// collapse onto the same corridor.
	const normalSign = horizontal
		? Math.sign(firstSegment.x) || 1
		: -(Math.sign(firstSegment.y) || 1);
	const shift = (point: RoutePoint): RoutePoint =>
		horizontal
			? { x: point.x, y: point.y + crossOffset * normalSign }
			: { x: point.x + crossOffset * normalSign, y: point.y };
	const first = points[0]!;
	const last = points.at(-1)!;
	return deduplicatePoints([
		first,
		shift(first),
		...points.slice(1, -1).map(shift),
		shift(last),
		last,
	]);
}

/**
 * Offsets a sampled curve and tapers the offset to zero at both endpoints.
 * Used by radial/bundled layouts where adding orthogonal branches would look
 * unnatural.
 */
export function offsetParallelPolyline(
	points: readonly RoutePoint[],
	offset: number,
): RoutePoint[] {
	if (Math.abs(offset) <= ROUTE_EPSILON || points.length < 3) {
		return points.map((point) => ({ ...point }));
	}

	return points.map((point, index) => {
		if (index === 0 || index === points.length - 1) {
			return { ...point };
		}
		const previous = points[index - 1]!;
		const next = points[index + 1]!;
		const tangentX = next.x - previous.x;
		const tangentY = next.y - previous.y;
		const length = Math.hypot(tangentX, tangentY);
		if (length <= ROUTE_EPSILON) {
			return { ...point };
		}
		const weight = Math.sin((Math.PI * index) / (points.length - 1));
		const distance = offset * weight;
		return {
			x: point.x - (tangentY / length) * distance,
			y: point.y + (tangentX / length) * distance,
		};
	});
}

function findFirstSegment(
	points: readonly RoutePoint[],
): RoutePoint | undefined {
	const first = points[0];
	if (!first) {
		return undefined;
	}
	for (const point of points.slice(1)) {
		const x = point.x - first.x;
		const y = point.y - first.y;
		if (Math.hypot(x, y) > ROUTE_EPSILON) {
			return { x, y };
		}
	}
	return undefined;
}

function deduplicatePoints(points: readonly RoutePoint[]): RoutePoint[] {
	return points.filter((point, index) => {
		const previous = points[index - 1];
		return (
			!previous ||
			Math.abs(previous.x - point.x) > ROUTE_EPSILON ||
			Math.abs(previous.y - point.y) > ROUTE_EPSILON
		);
	});
}
