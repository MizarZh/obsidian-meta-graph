import {
	getCanonicalParallelLane,
	type ParallelEdgeRouteAttributes,
} from '../graph/model/parallel-edges';
import {
	getEdgeType,
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';

export interface RoutePoint {
	x: number;
	y: number;
}

const ROUTE_EPSILON = 0.001;

/**
 * Compact visual separation used by direct parallel routes and Sigma's
 * fallback renderer. It keeps the corridor close to the source-to-target
 * chord while retaining enough room for adjacent line widths.
 */
export function getParallelEdgeGap(
	length: number,
	sourceSize: number,
	targetSize: number,
	edgeSize = 1,
): number {
	if (!Number.isFinite(length) || length <= ROUTE_EPSILON) {
		return 0;
	}
	const nodeSize = Math.max(sourceSize || 0, targetSize || 0);
	const desiredGap = Math.max(nodeSize * 0.42, (edgeSize || 1) * 2.2);
	return Math.min(length * 0.2, nodeSize * 0.65, desiredGap);
}

/**
 * Creates compact three-part direct route:
 * source -> short normal branch -> parallel corridor -> target branch -> target.
 */
export function createParallelDirectRoute(
	source: RoutePoint,
	target: RoutePoint,
	sourceSize: number,
	targetSize: number,
	attributes: ParallelEdgeRouteAttributes,
	edgeSize = 1,
): RoutePoint[] {
	const lane = getCanonicalParallelLane(attributes);
	const dx = target.x - source.x;
	const dy = target.y - source.y;
	const length = Math.hypot(dx, dy);
	if (Math.abs(lane) <= ROUTE_EPSILON || length <= ROUTE_EPSILON) {
		return [{ ...source }, { ...target }];
	}
	const offset =
		lane * getParallelEdgeGap(length, sourceSize, targetSize, edgeSize);
	if (Math.abs(offset) <= ROUTE_EPSILON) {
		return [{ ...source }, { ...target }];
	}
	const normal = { x: -dy / length, y: dx / length };
	const sourceBranch = {
		x: source.x + normal.x * offset,
		y: source.y + normal.y * offset,
	};
	const targetBranch = {
		x: target.x + normal.x * offset,
		y: target.y + normal.y * offset,
	};
	return deduplicatePoints([source, sourceBranch, targetBranch, target]);
}

/**
 * Replaces direct parallel edges in Sigma graphs with invisible bend nodes and
 * three edge segments. Logical metadata keeps selection, labels, styles, and
 * visibility tied to original edge.
 */
export function applyParallelDirectEdges(graph: RuntimeGraph): void {
	if (typeof graph.edges !== 'function') {
		return;
	}
	const edgeIds = graph.edges().filter((edgeId) => {
		const attributes = graph.getEdgeAttributes(edgeId);
		return (
			!attributes.logicalEdgeId &&
			(attributes.parallelCount ?? 1) > 1 &&
			Math.abs(getCanonicalParallelLane(attributes)) > ROUTE_EPSILON
		);
	});

	for (const edgeId of edgeIds) {
		if (!graph.hasEdge(edgeId)) {
			continue;
		}
		const source = graph.source(edgeId);
		const target = graph.target(edgeId);
		if (
			source === target ||
			!graph.hasNode(source) ||
			!graph.hasNode(target)
		) {
			continue;
		}
		const attributes = graph.getEdgeAttributes(edgeId);
		const directed = graph.isDirected(edgeId);
		const sourceAttributes = graph.getNodeAttributes(source);
		const targetAttributes = graph.getNodeAttributes(target);
		const points = createParallelDirectRoute(
			sourceAttributes,
			targetAttributes,
			sourceAttributes.size,
			targetAttributes.size,
			attributes,
			attributes.size,
		);
		if (points.length < 4) {
			continue;
		}

		graph.dropEdge(edgeId);
		const bendIds = [
			createUniqueNodeId(`__parallel-bend__${edgeId}__1`, graph),
			createUniqueNodeId(`__parallel-bend__${edgeId}__2`, graph),
		];
		graph.addNode(bendIds[0]!, createParallelBendNode(points[1]!));
		graph.addNode(bendIds[1]!, createParallelBendNode(points[2]!));
		const pathNodes = [source, bendIds[0]!, bendIds[1]!, target];
		const segmentAttributes = {
			...attributes,
			type: getEdgeType(
				attributes.lineStyle,
				false,
				attributes.arrowStyle,
			),
			label: '',
			forceLabel: false,
			logicalEdgeId: edgeId,
			logicalSource: source,
			logicalTarget: target,
			flowLabelPlacement: 'middle' as const,
			parallelDirectRoute: true,
		};
		for (let index = 0; index < pathNodes.length - 1; index += 1) {
			const segmentSource = pathNodes[index]!;
			const segmentTarget = pathNodes[index + 1]!;
			const arrowSegment = directed && index === 1;
			const segmentKey = `${edgeId}__segment_${index + 1}`;
			const styledSegment = {
				...segmentAttributes,
				type: getEdgeType(
					attributes.lineStyle,
					arrowSegment,
					attributes.arrowStyle,
				),
				...(directed ? { flowArrowSegment: arrowSegment } : {}),
				label: index === 1 ? attributes.label : '',
				forceLabel: index === 1 && Boolean(attributes.label),
			};
			if (directed) {
				graph.addDirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					styledSegment,
				);
			} else {
				graph.addUndirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					styledSegment,
				);
			}
		}
	}
}

/** Recomputes direct-route bend positions after node movement. */
export function syncParallelDirectEdgeRoutes(graph: RuntimeGraph): void {
	if (typeof graph.forEachEdge !== 'function') {
		return;
	}
	const groups = new Map<string, DirectRouteGroup>();
	graph.forEachEdge((edgeId, attributes, source, target) => {
		if (!attributes.parallelDirectRoute || !attributes.logicalEdgeId) {
			return;
		}
		const group = groups.get(attributes.logicalEdgeId) ?? {
			logicalEdgeId: attributes.logicalEdgeId,
			logicalSource: attributes.logicalSource ?? source,
			logicalTarget: attributes.logicalTarget ?? target,
			attributes,
			segments: [],
		};
		group.segments.push({ edgeId, source, target });
		groups.set(attributes.logicalEdgeId, group);
	});

	for (const group of groups.values()) {
		if (
			!graph.hasNode(group.logicalSource) ||
			!graph.hasNode(group.logicalTarget)
		) {
			continue;
		}
		const sourceAttributes = graph.getNodeAttributes(group.logicalSource);
		const targetAttributes = graph.getNodeAttributes(group.logicalTarget);
		const points = createParallelDirectRoute(
			sourceAttributes,
			targetAttributes,
			sourceAttributes.size,
			targetAttributes.size,
			group.attributes,
			group.attributes.size,
		);
		if (points.length < 4) {
			continue;
		}
		const firstBend = findBendAdjacentTo(
			graph,
			group.segments,
			group.logicalSource,
		);
		const secondBend = findBendAdjacentTo(
			graph,
			group.segments,
			group.logicalTarget,
		);
		if (!firstBend || !secondBend || firstBend === secondBend) {
			continue;
		}
		graph.mergeNodeAttributes(firstBend, {
			x: points[1]!.x,
			y: points[1]!.y,
		});
		graph.mergeNodeAttributes(secondBend, {
			x: points[2]!.x,
			y: points[2]!.y,
		});
	}
}

interface DirectRouteGroup {
	logicalEdgeId: string;
	logicalSource: string;
	logicalTarget: string;
	attributes: RuntimeEdgeAttributes;
	segments: Array<{ edgeId: string; source: string; target: string }>;
}

function findBendAdjacentTo(
	graph: RuntimeGraph,
	segments: readonly DirectRouteGroup['segments'][number][],
	nodeId: string,
): string | undefined {
	for (const segment of segments) {
		if (
			segment.source === nodeId &&
			graph.getNodeAttribute(segment.target, 'isBend')
		) {
			return segment.target;
		}
		if (
			segment.target === nodeId &&
			graph.getNodeAttribute(segment.source, 'isBend')
		) {
			return segment.source;
		}
	}
	return undefined;
}

function createParallelBendNode(point: RoutePoint): RuntimeNodeAttributes {
	return {
		label: '',
		x: point.x,
		y: point.y,
		size: 0.01,
		color: 'rgba(0, 0, 0, 0)',
		path: '',
		folder: '',
		domains: [],
		tags: [],
		fixed: true,
		isBend: true,
	};
}

function createUniqueNodeId(base: string, graph: RuntimeGraph): string {
	if (!graph.hasNode(base)) {
		return base;
	}
	let suffix = 2;
	let id = `${base}_${suffix}`;
	while (graph.hasNode(id)) {
		suffix += 1;
		id = `${base}_${suffix}`;
	}
	return id;
}

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
