import Sigma from 'sigma';
import type { FlowDirection } from '../../../core/types';
import type {
	FlowRouteKind,
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import { getParallelLaneOffset } from '../../model/parallel-edges';

const LAYER_ID = 'parallel-edges';
const HIT_CELL_SIZE = 64;
const HIT_PADDING = 6;
const ENDPOINT_STUB_PX = 8;

export interface ViewportPoint {
	x: number;
	y: number;
}

export interface ParallelCanvasRoute {
	points: readonly ViewportPoint[];
	arrowDirection: ViewportPoint;
	bounds: { left: number; top: number; right: number; bottom: number };
}

interface ParallelEdgeVisual {
	edgeId: string;
	runtimeEdgeIds: string[];
	source: string;
	target: string;
	attributes: RuntimeEdgeAttributes;
	directed: boolean;
}

interface CachedRoute {
	signature: string;
	route: ParallelCanvasRoute;
	path?: Path2D;
}

interface VisibleRoute {
	visual: ParallelEdgeVisual;
	route: ParallelCanvasRoute;
	path?: Path2D;
	lineWidth: number;
}

export interface ParallelEdgeLayerState {
	activeHoverNodeId?: string;
	mutedEdgeColor: string;
}

export class SigmaParallelEdgeLayer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private readonly routeCache = new Map<string, CachedRoute>();
	private readonly hitGrid = new Map<string, VisibleRoute[]>();
	private flowRouteIndexGraph?: RuntimeGraph;
	private flowRouteIndex = new Map<string, FlowRouteCandidate>();
	private visibleRoutes: VisibleRoute[] = [];
	private hoveredEdgeId?: string;
	private selectedEdgeId?: string;
	private animationFrame?: number;
	private readonly updateBound = () => this.update();

	constructor(
		private readonly sigma: Sigma<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes
		>,
		private readonly getGraph: () => RuntimeGraph,
		private readonly getState: () => ParallelEdgeLayerState,
		private readonly getLabelOpacity: () => number,
	) {
		sigma.createCanvasContext(LAYER_ID, {
			style: { pointerEvents: 'none' },
		});
		const canvases = sigma.getCanvases();
		const canvas = canvases[LAYER_ID];
		if (!canvas) {
			throw new Error('Sigma parallel edge layer was not created.');
		}
		const edges = canvases.edges;
		if (edges?.parentElement) {
			edges.parentElement.insertBefore(canvas, edges.nextSibling);
		}
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Sigma parallel edge canvas is unavailable.');
		}
		this.canvas = canvas;
		this.context = context;
		this.syncCanvasSize();
		sigma.on('afterRender', this.updateBound);
		const container = sigma.getContainer();
		container.addEventListener('pointermove', this.handlePointerMove);
		container.addEventListener('pointerleave', this.handlePointerLeave);
		container.addEventListener('click', this.handleClick);
	}

	invalidate(): void {
		this.routeCache.clear();
		this.flowRouteIndexGraph = undefined;
		this.flowRouteIndex.clear();
		this.scheduleUpdate();
	}

	getEdgeAtViewportPosition(position: ViewportPoint): string | undefined {
		const candidates = this.hitGrid.get(cellKey(position)) ?? [];
		let nearest: { id: string; distance: number } | undefined;
		for (const candidate of candidates) {
			const distance = distanceToPolyline(
				position,
				candidate.route.points,
			);
			const tolerance = Math.max(
				HIT_PADDING,
				candidate.lineWidth / 2 + 3,
			);
			if (
				distance > tolerance ||
				(nearest && distance >= nearest.distance)
			) {
				continue;
			}
			nearest = { id: candidate.visual.edgeId, distance };
		}
		return nearest?.id;
	}

	update(): void {
		this.cancelScheduledUpdate();
		this.syncCanvasSize();
		const { width, height } = this.sigma.getDimensions();
		this.context.clearRect(0, 0, width, height);
		this.visibleRoutes = [];
		this.hitGrid.clear();

		const visuals = collectParallelEdgeVisuals(this.getGraph());
		for (const visual of visuals) {
			const cached = this.getRoute(visual);
			if (
				!cached ||
				!intersectsViewport(cached.route.bounds, width, height)
			) {
				continue;
			}
			const lineWidth = Math.max(1, visual.attributes.size || 1);
			const visible = {
				visual,
				route: cached.route,
				path: cached.path,
				lineWidth,
			};
			this.visibleRoutes.push(visible);
			this.indexRoute(visible);
			this.drawRoute(visible);
		}
		this.canvas.hidden = this.visibleRoutes.length === 0;
	}

	kill(): void {
		this.cancelScheduledUpdate();
		this.sigma.off('afterRender', this.updateBound);
		const container = this.sigma.getContainer();
		container.removeEventListener('pointermove', this.handlePointerMove);
		container.removeEventListener('pointerleave', this.handlePointerLeave);
		container.removeEventListener('click', this.handleClick);
		this.routeCache.clear();
		this.flowRouteIndexGraph = undefined;
		this.flowRouteIndex.clear();
		this.hitGrid.clear();
		this.sigma.killLayer(LAYER_ID);
	}

	private getRoute(visual: ParallelEdgeVisual): CachedRoute | undefined {
		const graph = this.getGraph();
		if (!graph.hasNode(visual.source) || !graph.hasNode(visual.target)) {
			return undefined;
		}
		const sourceAttributes = graph.getNodeAttributes(visual.source);
		const targetAttributes = graph.getNodeAttributes(visual.target);
		if (sourceAttributes.hidden || targetAttributes.hidden) {
			return undefined;
		}
		const source = this.sigma.graphToViewport(sourceAttributes);
		const target = this.sigma.graphToViewport(targetAttributes);
		const sizeScaler = this.sigma as unknown as {
			scaleSize(size?: number): number;
		};
		const sourceRadius = Math.max(
			0,
			sizeScaler.scaleSize(sourceAttributes.size),
		);
		const targetRadius = Math.max(
			0,
			sizeScaler.scaleSize(targetAttributes.size),
		);
		const laneOffset = getParallelLaneOffset(
			visual.attributes,
			visual.attributes.size,
		);
		const flowRoute = readLogicalFlowRoute(
			graph,
			visual,
			this.getFlowRouteIndex(graph),
		);
		const axis = this.readRouteAxis(
			visual,
			source,
			target,
			flowRoute?.kind === 'curve' ? flowRoute.direction : undefined,
		);
		const signature = [
			source.x,
			source.y,
			target.x,
			target.y,
			sourceRadius,
			targetRadius,
			axis.x,
			axis.y,
			laneOffset,
			flowRoute?.kind ?? '',
			...(flowRoute?.route.flatMap((point) => [point.x, point.y]) ?? []),
		].join('|');
		const existing = this.routeCache.get(visual.edgeId);
		if (existing?.signature === signature) {
			return existing;
		}
		const route = flowRoute
			? createParallelCanvasRouteFromPolyline(
					flowRoute.route.map((point) =>
						this.sigma.graphToViewport(point),
					),
					source,
					target,
					sourceRadius,
					targetRadius,
					laneOffset,
					axis,
					flowRoute.kind,
				)
			: createParallelCanvasRoute(
					source,
					target,
					sourceRadius,
					targetRadius,
					laneOffset,
					axis,
				);
		if (!route) {
			return undefined;
		}
		const cached: CachedRoute = {
			signature,
			route,
			path: createPath(route.points),
		};
		this.routeCache.set(visual.edgeId, cached);
		return cached;
	}

	private getFlowRouteIndex(
		graph: RuntimeGraph,
	): ReadonlyMap<string, FlowRouteCandidate> {
		if (this.flowRouteIndexGraph === graph) {
			return this.flowRouteIndex;
		}
		this.flowRouteIndexGraph = graph;
		this.flowRouteIndex = collectFlowRouteIndex(graph);
		return this.flowRouteIndex;
	}

	private readRouteAxis(
		visual: ParallelEdgeVisual,
		source: ViewportPoint,
		target: ViewportPoint,
		flowDirection?: FlowDirection,
	): ViewportPoint {
		const graph = this.getGraph();
		const direct = { x: target.x - source.x, y: target.y - source.y };
		if (flowDirection) {
			return snapToFlowAxis(flowDirection, direct);
		}
		const arrowSegment = visual.runtimeEdgeIds.find(
			(edgeId) =>
				graph.hasEdge(edgeId) &&
				graph.getEdgeAttribute(edgeId, 'flowArrowSegment') === true,
		);
		if (arrowSegment) {
			const segmentSource = graph.getNodeAttributes(
				graph.source(arrowSegment),
			);
			const segmentTarget = graph.getNodeAttributes(
				graph.target(arrowSegment),
			);
			const first = this.sigma.graphToViewport(segmentSource);
			const second = this.sigma.graphToViewport(segmentTarget);
			return snapToPrimaryAxis(
				{ x: second.x - first.x, y: second.y - first.y },
				{ x: target.x - source.x, y: target.y - source.y },
			);
		}
		return visual.attributes.logicalEdgeId
			? snapToPrimaryAxis(direct, direct)
			: normalize(direct);
	}

	private drawRoute(visible: VisibleRoute): void {
		const { visual, route } = visible;
		const attributes = visual.attributes;
		const state = this.getState();
		const connectedToHover =
			!state.activeHoverNodeId ||
			visual.source === state.activeHoverNodeId ||
			visual.target === state.activeHoverNodeId;
		const hovered = visual.edgeId === this.hoveredEdgeId;
		const selected = visual.edgeId === this.selectedEdgeId;
		const opacity = Math.max(0, Math.min(1, attributes.opacity ?? 1));

		this.context.save();
		this.context.globalAlpha = connectedToHover ? opacity : opacity * 0.18;
		this.context.strokeStyle = connectedToHover
			? attributes.color
			: state.mutedEdgeColor;
		this.context.lineWidth =
			visible.lineWidth + (hovered || selected ? 2 : 0);
		this.context.lineCap = 'round';
		this.context.lineJoin = 'round';
		this.context.setLineDash(getLineDash(attributes.lineStyle));
		if (visible.path) {
			this.context.stroke(visible.path);
		} else {
			tracePolyline(this.context, route.points);
			this.context.stroke();
		}
		this.context.setLineDash([]);
		if (visual.directed) {
			this.drawArrow(visible);
		}
		if (attributes.label) {
			this.drawLabel(visible);
		}
		this.context.restore();
	}

	private drawArrow(visible: VisibleRoute): void {
		const { attributes } = visible.visual;
		const points = visible.route.points;
		const tip = points.at(-1);
		if (!tip) return;
		const direction = visible.route.arrowDirection;
		const normal = { x: -direction.y, y: direction.x };
		const scale = Math.max(0.25, attributes.arrowSize ?? 1);
		const length = Math.max(5, visible.lineWidth * 3.2) * scale;
		const halfWidth = Math.max(3.5, visible.lineWidth * 2.2) * scale;
		const base = {
			x: tip.x - direction.x * length,
			y: tip.y - direction.y * length,
		};
		const left = {
			x: base.x + normal.x * halfWidth,
			y: base.y + normal.y * halfWidth,
		};
		const right = {
			x: base.x - normal.x * halfWidth,
			y: base.y - normal.y * halfWidth,
		};
		this.context.beginPath();
		this.context.moveTo(left.x, left.y);
		this.context.lineTo(tip.x, tip.y);
		this.context.lineTo(right.x, right.y);
		if (attributes.arrowStyle === 'chevron') {
			this.context.lineWidth = Math.max(1.5, visible.lineWidth);
			this.context.stroke();
			return;
		}
		this.context.closePath();
		this.context.fillStyle = this.context.strokeStyle;
		this.context.fill();
	}

	private drawLabel(visible: VisibleRoute): void {
		const points = visible.route.points;
		const labelSegment = findLongestSegment(points);
		const start = labelSegment ? points[labelSegment] : points[0];
		const end = labelSegment ? points[labelSegment + 1] : points.at(-1);
		if (!start || !end) return;
		const attributes = visible.visual.attributes;
		const position = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
		let rotation = Math.atan2(end.y - start.y, end.x - start.x);
		if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
			rotation += Math.PI;
		}
		const fontSize = this.sigma.getSetting('edgeLabelSize');
		const fontFamily = this.sigma.getSetting('edgeLabelFont');
		const fontWeight = this.sigma.getSetting('edgeLabelWeight');
		const containerStyle = getComputedStyle(this.sigma.getContainer());
		const background =
			containerStyle.getPropertyValue('--background-primary').trim() ||
			'#ffffff';
		this.context.save();
		this.context.translate(position.x, position.y);
		this.context.rotate(rotation);
		this.context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
		this.context.textAlign = 'center';
		this.context.textBaseline = 'middle';
		const width = this.context.measureText(attributes.label).width + 8;
		this.context.globalAlpha *= this.getLabelOpacity();
		this.context.fillStyle = background;
		this.context.fillRect(
			-width / 2,
			-fontSize / 2 - 2,
			width,
			fontSize + 4,
		);
		this.context.fillStyle = attributes.color;
		this.context.fillText(attributes.label, 0, 0);
		this.context.restore();
	}

	private indexRoute(route: VisibleRoute): void {
		const bounds = expandBounds(route.route.bounds, HIT_PADDING);
		const firstX = Math.floor(bounds.left / HIT_CELL_SIZE);
		const lastX = Math.floor(bounds.right / HIT_CELL_SIZE);
		const firstY = Math.floor(bounds.top / HIT_CELL_SIZE);
		const lastY = Math.floor(bounds.bottom / HIT_CELL_SIZE);
		for (let x = firstX; x <= lastX; x += 1) {
			for (let y = firstY; y <= lastY; y += 1) {
				const key = `${x}:${y}`;
				const entries = this.hitGrid.get(key) ?? [];
				entries.push(route);
				this.hitGrid.set(key, entries);
			}
		}
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		const edgeId = this.getEdgeAtViewportPosition(this.readPointer(event));
		if (edgeId === this.hoveredEdgeId) return;
		this.hoveredEdgeId = edgeId;
		this.scheduleUpdate();
	};

	private readonly handlePointerLeave = (): void => {
		if (!this.hoveredEdgeId) return;
		this.hoveredEdgeId = undefined;
		this.scheduleUpdate();
	};

	private readonly handleClick = (event: MouseEvent): void => {
		const edgeId = this.getEdgeAtViewportPosition(this.readPointer(event));
		if (edgeId === this.selectedEdgeId) return;
		this.selectedEdgeId = edgeId;
		this.scheduleUpdate();
	};

	private readPointer(event: MouseEvent | PointerEvent): ViewportPoint {
		const rect = this.sigma.getContainer().getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	private scheduleUpdate(): void {
		if (this.animationFrame !== undefined) return;
		const view = this.canvas.ownerDocument.defaultView;
		const update = () => {
			this.animationFrame = undefined;
			this.update();
		};
		this.animationFrame = view
			? view.requestAnimationFrame(update)
			: window.requestAnimationFrame(update);
	}

	private cancelScheduledUpdate(): void {
		if (this.animationFrame === undefined) return;
		const view = this.canvas.ownerDocument.defaultView;
		if (view) view.cancelAnimationFrame(this.animationFrame);
		else cancelAnimationFrame(this.animationFrame);
		this.animationFrame = undefined;
	}

	private syncCanvasSize(): void {
		const { width, height } = this.sigma.getDimensions();
		const ratio = Math.min(
			2,
			Math.max(
				1,
				this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1,
			),
		);
		const pixelWidth = Math.round(width * ratio);
		const pixelHeight = Math.round(height * ratio);
		if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
		if (this.canvas.height !== pixelHeight)
			this.canvas.height = pixelHeight;
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;
		this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
	}
}

export function createParallelCanvasRoute(
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	laneOffset: number,
	preferredAxis?: ViewportPoint,
): ParallelCanvasRoute | undefined {
	const direct = { x: target.x - source.x, y: target.y - source.y };
	const distance = Math.hypot(direct.x, direct.y);
	if (distance < 0.001) return undefined;
	let axis = normalize(preferredAxis ?? direct);
	if (axis.x * direct.x + axis.y * direct.y < 0) {
		axis = { x: -axis.x, y: -axis.y };
	}
	if (Math.abs(axis.x) > 0.001 && Math.abs(axis.y) > 0.001) {
		return createDirectParallelChordRoute(
			source,
			target,
			sourceRadius,
			targetRadius,
			laneOffset,
			axis,
		);
	}
	const bridge =
		axis.x !== 0
			? { x: (source.x + target.x) / 2, y: source.y }
			: { x: source.x, y: (source.y + target.y) / 2 };
	return createParallelCanvasRouteFromPolyline(
		[source, bridge, target],
		source,
		target,
		sourceRadius,
		targetRadius,
		laneOffset,
		axis,
	);
}

function createDirectParallelChordRoute(
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	laneOffset: number,
	axis: ViewportPoint,
): ParallelCanvasRoute {
	const normal = { x: -axis.y, y: axis.x };
	const distance = distanceBetweenViewport(source, target);
	const available = Math.max(0, distance - sourceRadius - targetRadius);
	const stub = Math.min(ENDPOINT_STUB_PX, Math.max(2, available / 4));
	const sourcePort = add(source, scale(axis, sourceRadius));
	const targetPort = add(target, scale(axis, -targetRadius));
	const sourceAxisStub = add(sourcePort, scale(axis, stub));
	const targetAxisStub = add(targetPort, scale(axis, -stub));
	const offset = scale(normal, laneOffset);
	const points = [
		sourcePort,
		sourceAxisStub,
		add(sourceAxisStub, offset),
		add(targetAxisStub, offset),
		targetAxisStub,
		targetPort,
	];
	return {
		points,
		arrowDirection: axis,
		bounds: boundsOf(points),
	};
}

/**
 * Creates a compact parallel route from an existing Flow polyline. The base
 * polyline is kept as the source of truth. Axis-aligned routes use offset
 * segment intersections; sampled smooth routes use local tangent offsets.
 */
export function createParallelCanvasRouteFromPolyline(
	basePoints: readonly ViewportPoint[],
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	laneOffset: number,
	preferredAxis?: ViewportPoint,
	routeKind: FlowRouteKind | boolean = 'orthogonal',
): ParallelCanvasRoute | undefined {
	const direct = { x: target.x - source.x, y: target.y - source.y };
	const distance = Math.hypot(direct.x, direct.y);
	if (distance < 0.001) return undefined;
	let axis = normalize(preferredAxis ?? direct);
	if (axis.x * direct.x + axis.y * direct.y < 0) {
		axis = { x: -axis.x, y: -axis.y };
	}
	const resolvedRouteKind: FlowRouteKind =
		typeof routeKind === 'boolean'
			? routeKind
				? 'rounded'
				: 'orthogonal'
			: routeKind;
	const smooth = resolvedRouteKind !== 'orthogonal';
	const base = smooth
		? deduplicateViewportPoints(basePoints)
		: normalizeViewportRoute(basePoints, axis);
	const normalized =
		resolvedRouteKind === 'curve' ? base : ensureEndpointAxis(base, axis);
	if (normalized.length < 2) return undefined;
	const shifted = smooth
		? offsetSmoothPolyline(normalized, laneOffset)
		: offsetOrthogonalPolyline(normalized, laneOffset);
	const points =
		resolvedRouteKind === 'curve'
			? clipCurveRouteEndpoints(
					shifted,
					source,
					target,
					sourceRadius,
					targetRadius,
					axis,
			  )
			: clipRouteEndpoints(
						shifted,
						source,
						target,
						sourceRadius,
						targetRadius,
						axis,
				  );
	return {
		points,
		arrowDirection: axis,
		bounds: boundsOf(points),
	};
}

/**
 * Clips a Curve route to node circles while keeping a short flow-axis tangent
 * at each endpoint. Quadratic transitions remove the right-angle hook caused
 * by inserting an axis-aligned elbow into the sampled curve.
 */
function clipCurveRouteEndpoints(
	points: readonly ViewportPoint[],
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	axis: ViewportPoint,
): ViewportPoint[] {
	if (points.length < 2) return points.map((point) => ({ ...point }));
	const shifted = points.map((point) => ({ ...point }));
	const first = shifted[0]!;
	const firstNext = shifted[1]!;
	const lastIndex = shifted.length - 1;
	const last = shifted[lastIndex]!;
	const lastPrevious = shifted[lastIndex - 1]!;
	const sourceTip = clipEndpointToCircle(
		source,
		Math.max(0, sourceRadius),
		first,
		axis,
		true,
	);
	const targetTip = clipEndpointToCircle(
		target,
		Math.max(0, targetRadius),
		last,
		axis,
		false,
	);
	if (shifted.length === 2) {
		return deduplicateViewportPoints([sourceTip, targetTip]);
	}
	const sourceTransition = createEndpointTransition(
		sourceTip,
		firstNext,
		axis,
		normalizeVector({
			x: (shifted[2] ?? firstNext).x - firstNext.x,
			y: (shifted[2] ?? firstNext).y - firstNext.y,
		}) ?? axis,
	);
	const targetTransition = createEndpointTransition(
		lastPrevious,
		targetTip,
		normalizeVector({
			x: lastPrevious.x - (shifted[lastIndex - 2] ?? lastPrevious).x,
			y: lastPrevious.y - (shifted[lastIndex - 2] ?? lastPrevious).y,
		}) ?? axis,
		axis,
	);
	return deduplicateViewportPoints([
		...sourceTransition,
		...shifted.slice(2, -2),
		...targetTransition,
	]);
}

function createEndpointTransition(
	start: ViewportPoint,
	end: ViewportPoint,
	startTangent: ViewportPoint,
	endTangent: ViewportPoint,
): ViewportPoint[] {
	const distance = distanceBetweenViewport(start, end);
	if (distance < 0.001) return [start, end];
	const stub = Math.min(ENDPOINT_STUB_PX, distance / 2);
	const firstControl = add(start, scale(startTangent, stub));
	const secondControl = add(end, scale(endTangent, -stub));
	const samples: ViewportPoint[] = [start];
	for (let step = 1; step < 4; step += 1) {
		samples.push(
			cubicViewportPoint(
				start,
				firstControl,
				secondControl,
				end,
				step / 4,
			),
		);
	}
	samples.push(end);
	return samples;
}

function cubicViewportPoint(
	start: ViewportPoint,
	firstControl: ViewportPoint,
	secondControl: ViewportPoint,
	end: ViewportPoint,
	t: number,
): ViewportPoint {
	const inverse = 1 - t;
	return {
		x:
			inverse * inverse * inverse * start.x +
			3 * inverse * inverse * t * firstControl.x +
			3 * inverse * t * t * secondControl.x +
			t * t * t * end.x,
		y:
			inverse * inverse * inverse * start.y +
			3 * inverse * inverse * t * firstControl.y +
			3 * inverse * t * t * secondControl.y +
			t * t * t * end.y,
	};
}

/**
 * Offsets a sampled smooth route without replacing its curve with new
 * orthogonal elbows. A local averaged tangent keeps the offset smooth
 * through each sampled corner while preserving the source geometry.
 */
function offsetSmoothPolyline(
	points: readonly ViewportPoint[],
	offset: number,
): ViewportPoint[] {
	const sourcePoints = deduplicateViewportPoints(points);
	if (sourcePoints.length < 2 || Math.abs(offset) < 0.001) {
		return sourcePoints.map((point) => ({ ...point }));
	}
	return sourcePoints.map((point, index) => {
		const previous = sourcePoints[index - 1];
		const next = sourcePoints[index + 1];
		const incoming = previous
			? normalizeVector({
					x: point.x - previous.x,
					y: point.y - previous.y,
			  })
			: undefined;
		const outgoing = next
			? normalizeVector({
					x: next.x - point.x,
					y: next.y - point.y,
			  })
			: undefined;
		const tangent = averageDirection(incoming, outgoing);
		if (!tangent) return { ...point };
		return {
			x: point.x - tangent.y * offset,
			y: point.y + tangent.x * offset,
		};
	});
}

function normalizeVector(vector: ViewportPoint): ViewportPoint | undefined {
	const length = Math.hypot(vector.x, vector.y);
	return length > 0.001
		? { x: vector.x / length, y: vector.y / length }
		: undefined;
}

function averageDirection(
	incoming: ViewportPoint | undefined,
	outgoing: ViewportPoint | undefined,
): ViewportPoint | undefined {
	if (!incoming) return outgoing;
	if (!outgoing) return incoming;
	const averaged = normalizeVector({
		x: incoming.x + outgoing.x,
		y: incoming.y + outgoing.y,
	});
	return averaged ?? outgoing;
}

function normalizeViewportRoute(
	points: readonly ViewportPoint[],
	axis: ViewportPoint,
): ViewportPoint[] {
	const sourcePoints = deduplicateViewportPoints(points);
	if (sourcePoints.length < 2) return sourcePoints;
	const horizontal = Math.abs(axis.x) >= Math.abs(axis.y);
	const normalized: ViewportPoint[] = [sourcePoints[0]!];
	for (let index = 1; index < sourcePoints.length; index += 1) {
		const current = sourcePoints[index]!;
		const previous = normalized.at(-1)!;
		if (isAxisAlignedViewport(previous, current)) {
			normalized.push(current);
			continue;
		}
		const isLast = index === sourcePoints.length - 1;
		const elbow = horizontal
			? isLast
				? { x: previous.x, y: current.y }
				: { x: current.x, y: previous.y }
			: isLast
				? { x: current.x, y: previous.y }
				: { x: previous.x, y: current.y };
		normalized.push(elbow, current);
	}
	return deduplicateViewportPoints(normalized);
}

function ensureEndpointAxis(
	points: readonly ViewportPoint[],
	axis: ViewportPoint,
): ViewportPoint[] {
	if (points.length < 2) return points.map((point) => ({ ...point }));
	const horizontal = Math.abs(axis.x) >= Math.abs(axis.y);
	const result = [...points].map((point) => ({ ...point }));
	const first = result[0]!;
	const firstNext = result[1]!;
	if (
		horizontal
			? !isHorizontal(first, firstNext)
			: !isVertical(first, firstNext)
	) {
		const stub = Math.max(
			2,
			Math.min(
				ENDPOINT_STUB_PX,
				distanceBetweenViewport(first, firstNext) / 2,
			),
		);
		const firstStub = add(first, scale(axis, stub));
		const firstJoin = horizontal
			? { x: firstStub.x, y: firstNext.y }
			: { x: firstNext.x, y: firstStub.y };
		result.splice(1, 0, firstStub, firstJoin);
	}

	const lastIndex = result.length - 1;
	const last = result[lastIndex]!;
	const previous = result[lastIndex - 1]!;
	if (
		horizontal ? !isHorizontal(previous, last) : !isVertical(previous, last)
	) {
		const stub = Math.max(
			2,
			Math.min(
				ENDPOINT_STUB_PX,
				distanceBetweenViewport(previous, last) / 2,
			),
		);
		const lastStub = add(last, scale(axis, -stub));
		const lastJoin = horizontal
			? { x: lastStub.x, y: previous.y }
			: { x: previous.x, y: lastStub.y };
		result.splice(result.length - 1, 0, lastJoin, lastStub);
	}
	return deduplicateViewportPoints(result);
}

function offsetOrthogonalPolyline(
	points: readonly ViewportPoint[],
	offset: number,
): ViewportPoint[] {
	const sourcePoints = deduplicateViewportPoints(points);
	if (sourcePoints.length < 2 || Math.abs(offset) < 0.001) {
		return sourcePoints.map((point) => ({ ...point }));
	}
	const shifted: ViewportPoint[] = [];
	for (let index = 0; index < sourcePoints.length; index += 1) {
		const point = sourcePoints[index]!;
		if (index === 0) {
			shifted.push(
				shiftPointForSegment(point, sourcePoints[index + 1]!, offset),
			);
			continue;
		}
		if (index === sourcePoints.length - 1) {
			shifted.push(
				shiftPointForSegment(
					point,
					point,
					offset,
					sourcePoints[index - 1],
				),
			);
			continue;
		}
		const previous = sourcePoints[index - 1]!;
		const next = sourcePoints[index + 1]!;
		const incoming = shiftPointForSegment(point, point, offset, previous);
		const outgoing = shiftPointForSegment(point, next, offset);
		const incomingHorizontal = isHorizontal(previous, point);
		const outgoingHorizontal = isHorizontal(point, next);
		if (incomingHorizontal === outgoingHorizontal) {
			shifted.push(incoming);
		} else if (incomingHorizontal) {
			shifted.push({ x: outgoing.x, y: incoming.y });
		} else {
			shifted.push({ x: incoming.x, y: outgoing.y });
		}
	}
	return deduplicateViewportPoints(shifted);
}

function shiftPointForSegment(
	point: ViewportPoint,
	to: ViewportPoint,
	offset: number,
	from?: ViewportPoint,
): ViewportPoint {
	const start = from ?? point;
	const dx = to.x - start.x;
	const dy = to.y - start.y;
	if (Math.abs(dx) >= Math.abs(dy)) {
		return { x: point.x, y: point.y + offset * (Math.sign(dx) || 1) };
	}
	return { x: point.x - offset * (Math.sign(dy) || 1), y: point.y };
}

function clipRouteEndpoints(
	points: readonly ViewportPoint[],
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	axis: ViewportPoint,
): ViewportPoint[] {
	if (points.length < 2) return points.map((point) => ({ ...point }));
	const clipped = points.map((point) => ({ ...point }));
	const first = clipped[0]!;
	const firstNext = clipped[1]!;
	const lastIndex = clipped.length - 1;
	const last = clipped[lastIndex]!;
	const lastPrevious = clipped[lastIndex - 1]!;
	clipped[0] = clipEndpointToCircle(
		source,
		Math.max(0, sourceRadius),
		first,
		axis,
		true,
	);
	clipped[lastIndex] = clipEndpointToCircle(
		target,
		Math.max(0, targetRadius),
		last,
		axis,
		false,
	);
	if (Math.abs(axis.x) >= Math.abs(axis.y)) {
		clipped[1] = {
			x: firstNext.x,
			y: clipped[0].y,
		};
		clipped[lastIndex - 1] = {
			x: lastPrevious.x,
			y: clipped[lastIndex].y,
		};
	} else {
		clipped[1] = {
			x: clipped[0].x,
			y: firstNext.y,
		};
		clipped[lastIndex - 1] = {
			x: clipped[lastIndex].x,
			y: lastPrevious.y,
		};
	}
	return deduplicateViewportPoints(clipped);
}

function clipEndpointToCircle(
	center: ViewportPoint,
	radius: number,
	shiftedEndpoint: ViewportPoint,
	axis: ViewportPoint,
	source: boolean,
): ViewportPoint {
	if (radius <= 0.001) return { ...shiftedEndpoint };
	const horizontal = Math.abs(axis.x) >= Math.abs(axis.y);
	const maxCross = Math.max(0, radius - 0.5);
	if (horizontal) {
		const cross = clamp(shiftedEndpoint.y - center.y, -maxCross, maxCross);
		const primary = Math.sqrt(Math.max(0, radius * radius - cross * cross));
		return {
			x: center.x + (source ? axis.x : -axis.x) * primary,
			y: center.y + cross,
		};
	}
	const cross = clamp(shiftedEndpoint.x - center.x, -maxCross, maxCross);
	const primary = Math.sqrt(Math.max(0, radius * radius - cross * cross));
	return {
		x: center.x + cross,
		y: center.y + (source ? axis.y : -axis.y) * primary,
	};
}

function isAxisAlignedViewport(
	left: ViewportPoint,
	right: ViewportPoint,
): boolean {
	return isHorizontal(left, right) || isVertical(left, right);
}

function isHorizontal(left: ViewportPoint, right: ViewportPoint): boolean {
	return Math.abs(left.y - right.y) < 0.001;
}

function isVertical(left: ViewportPoint, right: ViewportPoint): boolean {
	return Math.abs(left.x - right.x) < 0.001;
}

function deduplicateViewportPoints(
	points: readonly ViewportPoint[],
): ViewportPoint[] {
	const result: ViewportPoint[] = [];
	for (const point of points) {
		const previous = result.at(-1);
		if (
			previous &&
			Math.abs(previous.x - point.x) < 0.001 &&
			Math.abs(previous.y - point.y) < 0.001
		) {
			continue;
		}
		result.push({ ...point });
	}
	return result;
}

function distanceBetweenViewport(
	left: ViewportPoint,
	right: ViewportPoint,
): number {
	return Math.hypot(right.x - left.x, right.y - left.y);
}

function distanceSquared(
	left: ViewportPoint,
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function findLongestSegment(
	points: readonly ViewportPoint[],
): number | undefined {
	let longestIndex: number | undefined;
	let longestLength = 0;
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		const length = distanceBetweenViewport(start, end);
		if (length > longestLength) {
			longestLength = length;
			longestIndex = index;
		}
	}
	return longestIndex;
}

export function distanceToPolyline(
	point: ViewportPoint,
	points: readonly ViewportPoint[],
): number {
	let distance = Number.POSITIVE_INFINITY;
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index];
		const end = points[index + 1];
		if (!start || !end) continue;
		distance = Math.min(distance, distanceToSegment(point, start, end));
	}
	return distance;
}

function collectParallelEdgeVisuals(graph: RuntimeGraph): ParallelEdgeVisual[] {
	const visuals = new Map<string, ParallelEdgeVisual>();
	graph.forEachEdge((runtimeEdgeId, attributes, source, target) => {
		if ((attributes.parallelCount ?? 1) < 2 || attributes.hidden) return;
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
		if (logicalSource === logicalTarget) return;
		const edgeId = attributes.logicalEdgeId ?? runtimeEdgeId;
		const existing = visuals.get(edgeId);
		if (existing) {
			existing.runtimeEdgeIds.push(runtimeEdgeId);
			if (attributes.flowArrowSegment) {
				const label = attributes.label || existing.attributes.label;
				existing.attributes = {
					...attributes,
					label,
					forceLabel: Boolean(label),
				};
			} else if (attributes.label) {
				existing.attributes = {
					...existing.attributes,
					label: attributes.label,
					forceLabel: true,
				};
			}
			return;
		}
		visuals.set(edgeId, {
			edgeId,
			runtimeEdgeIds: [runtimeEdgeId],
			source: logicalSource,
			target: logicalTarget,
			attributes,
			directed: graph.isDirected(runtimeEdgeId),
		});
	});
	return [...visuals.values()];
}

interface FlowRouteCandidate {
	logicalEdgeId: string;
	lane: number;
	route: readonly ViewportPoint[];
	kind: FlowRouteKind;
	direction?: FlowDirection;
}

/**
	 * Reads the logical route saved by the Flow layout. A parallel group uses the
	 * route closest to its center lane so Canvas only adds a small screen-space
	 * offset instead of reproducing ELK's per-edge port spacing.
 */
function readLogicalFlowRoute(
	graph: RuntimeGraph,
	visual: ParallelEdgeVisual,
	index: ReadonlyMap<string, FlowRouteCandidate>,
): FlowRouteCandidate | undefined {
	const groupKey = visual.attributes.parallelGroupKey;
	const candidate = index.get(groupKey ?? visual.edgeId);
	if (!candidate || candidate.route.length < 2) {
		return undefined;
	}

	const source = graph.getNodeAttributes(visual.source);
	const target = graph.getNodeAttributes(visual.target);
	const first = candidate.route[0];
	const last = candidate.route.at(-1);
	if (!first || !last) {
		return undefined;
	}
	const forwardDistance =
		distanceSquared(first, source) + distanceSquared(last, target);
	const reverseDistance =
		distanceSquared(first, target) + distanceSquared(last, source);
	return reverseDistance < forwardDistance
		? { ...candidate, route: [...candidate.route].reverse() }
		: { ...candidate, route: candidate.route.map((point) => ({ ...point })) };
}

function collectFlowRouteIndex(
	graph: RuntimeGraph,
): Map<string, FlowRouteCandidate> {
	const index = new Map<string, FlowRouteCandidate>();
	graph.forEachEdge((runtimeEdgeId, attributes) => {
		const kind =
			attributes.flowRouteKind ??
			(attributes.flowRouteRounded
				? 'rounded'
				: attributes.flowRouteOrthogonal
					? 'orthogonal'
					: undefined);
		if (
			attributes.hidden ||
			!kind ||
			!attributes.flowRoute?.length
		) {
			return;
		}
		const logicalEdgeId = attributes.logicalEdgeId ?? runtimeEdgeId;
		const key = attributes.parallelGroupKey ?? logicalEdgeId;
		const candidate: FlowRouteCandidate = {
			logicalEdgeId,
			lane: Math.abs(attributes.parallelLane ?? 0),
			route: attributes.flowRoute.map((point) => ({ ...point })),
			kind,
			direction: attributes.flowRouteDirection,
		};
		const existing = index.get(key);
		if (
			!existing ||
			candidate.lane < existing.lane ||
			(candidate.lane === existing.lane &&
				candidate.logicalEdgeId.localeCompare(existing.logicalEdgeId) <
					0)
		) {
			index.set(key, candidate);
		}
	});
	return index;
}

function createPath(points: readonly ViewportPoint[]): Path2D | undefined {
	if (typeof Path2D === 'undefined') return undefined;
	const path = new Path2D();
	const first = points[0];
	if (!first) return path;
	path.moveTo(first.x, first.y);
	for (const point of points.slice(1)) path.lineTo(point.x, point.y);
	return path;
}

function tracePolyline(
	context: CanvasRenderingContext2D,
	points: readonly ViewportPoint[],
): void {
	const first = points[0];
	if (!first) return;
	context.beginPath();
	context.moveTo(first.x, first.y);
	for (const point of points.slice(1)) context.lineTo(point.x, point.y);
}

function getLineDash(lineStyle: RuntimeEdgeAttributes['lineStyle']): number[] {
	if (lineStyle === 'dashed') return [10, 7];
	if (lineStyle === 'dotted') return [2, 5];
	if (lineStyle === 'dash-dot') return [10, 5, 2, 5];
	return [];
}

function snapToPrimaryAxis(
	candidate: ViewportPoint,
	fallback: ViewportPoint,
): ViewportPoint {
	const vector =
		Math.hypot(candidate.x, candidate.y) > 0.001 ? candidate : fallback;
	if (Math.abs(vector.x) >= Math.abs(vector.y)) {
		return { x: Math.sign(vector.x) || Math.sign(fallback.x) || 1, y: 0 };
	}
	return { x: 0, y: Math.sign(vector.y) || Math.sign(fallback.y) || 1 };
}

function snapToFlowAxis(
	direction: FlowDirection,
	vector: ViewportPoint,
): ViewportPoint {
	const horizontal = direction === 'LR' || direction === 'RL';
	const primary = horizontal ? vector.x : vector.y;
	const fallbackSign =
		direction === 'RL' || direction === 'DT' ? -1 : 1;
	const sign = Math.sign(primary) || fallbackSign;
	return horizontal ? { x: sign, y: 0 } : { x: 0, y: sign };
}

function normalize(point: ViewportPoint): ViewportPoint {
	const length = Math.hypot(point.x, point.y) || 1;
	return { x: point.x / length, y: point.y / length };
}

function add(left: ViewportPoint, right: ViewportPoint): ViewportPoint {
	return { x: left.x + right.x, y: left.y + right.y };
}

function scale(point: ViewportPoint, amount: number): ViewportPoint {
	return { x: point.x * amount, y: point.y * amount };
}

function boundsOf(points: readonly ViewportPoint[]) {
	return {
		left: Math.min(...points.map((point) => point.x)),
		top: Math.min(...points.map((point) => point.y)),
		right: Math.max(...points.map((point) => point.x)),
		bottom: Math.max(...points.map((point) => point.y)),
	};
}

function expandBounds(
	bounds: ParallelCanvasRoute['bounds'],
	padding: number,
): ParallelCanvasRoute['bounds'] {
	return {
		left: bounds.left - padding,
		top: bounds.top - padding,
		right: bounds.right + padding,
		bottom: bounds.bottom + padding,
	};
}

function intersectsViewport(
	bounds: ParallelCanvasRoute['bounds'],
	width: number,
	height: number,
): boolean {
	return !(
		bounds.right < 0 ||
		bounds.bottom < 0 ||
		bounds.left > width ||
		bounds.top > height
	);
}

function cellKey(point: ViewportPoint): string {
	return `${Math.floor(point.x / HIT_CELL_SIZE)}:${Math.floor(point.y / HIT_CELL_SIZE)}`;
}

function distanceToSegment(
	point: ViewportPoint,
	start: ViewportPoint,
	end: ViewportPoint,
): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0)
		return Math.hypot(point.x - start.x, point.y - start.y);
	const projection = Math.max(
		0,
		Math.min(
			1,
			((point.x - start.x) * dx + (point.y - start.y) * dy) /
				lengthSquared,
		),
	);
	return Math.hypot(
		point.x - (start.x + projection * dx),
		point.y - (start.y + projection * dy),
	);
}
