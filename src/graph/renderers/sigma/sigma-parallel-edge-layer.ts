import Sigma from 'sigma';
import type {
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
		const axis = this.readRouteAxis(visual, source, target);
		const laneOffset = getParallelLaneOffset(
			visual.attributes,
			visual.attributes.size,
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
		].join('|');
		const existing = this.routeCache.get(visual.edgeId);
		if (existing?.signature === signature) {
			return existing;
		}
		const route = createParallelCanvasRoute(
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

	private readRouteAxis(
		visual: ParallelEdgeVisual,
		source: ViewportPoint,
		target: ViewportPoint,
	): ViewportPoint {
		const graph = this.getGraph();
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
		const direct = { x: target.x - source.x, y: target.y - source.y };
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
		const start = points[2] ?? points[0];
		const end = points[3] ?? points.at(-1);
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
			: requestAnimationFrame(update);
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
	const normal = { x: -axis.y, y: axis.x };
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
