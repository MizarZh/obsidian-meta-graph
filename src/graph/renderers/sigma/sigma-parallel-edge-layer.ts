import Sigma from 'sigma';
import type { FlowDirection } from '../../../core/types';
import type {
	FlowRouteKind,
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import { getCanonicalParallelLane } from '../../model/parallel-edges';
import {
	EDGE_CHEVRON_WING_RATIO,
	resolveEdgeVisualMetrics,
	type EdgeVisualMetrics,
	type EdgeVisualMetricsOptions,
} from './sigma-edge-visual-metrics';
import { isCanvasParallelEdge } from './sigma-parallel-edge-policy';

const LAYER_ID = 'parallel-edges';
const HIT_CELL_SIZE = 64;
const ENDPOINT_STUB_PX = 8;
// Keep the shield narrower than the minimum parallel-lane spacing so adjacent
// focused links remain distinguishable while crossing fragments are covered.
const FOCUS_EDGE_CLEARANCE_PX = 1;

export interface ViewportPoint {
	x: number;
	y: number;
}

export interface ParallelCanvasRoute {
	points: readonly ViewportPoint[];
	arrowDirection: ViewportPoint;
	/** Optional arrow tip for native logical routes whose arrow is not at the end. */
	arrowTip?: ViewportPoint;
	bounds: { left: number; top: number; right: number; bottom: number };
}

interface ParallelEdgeVisual {
	kind: 'canvas';
	edgeId: string;
	runtimeEdgeIds: string[];
	source: string;
	target: string;
	attributes: RuntimeEdgeAttributes;
	directed: boolean;
}

interface NativeEdgeSegment extends NativeEdgeSegmentDescriptor {
	attributes: RuntimeEdgeAttributes;
	directed: boolean;
}

interface NativeEdgeVisual {
	kind: 'native';
	edgeId: string;
	source: string;
	target: string;
	attributes: RuntimeEdgeAttributes;
	directed: boolean;
	segments: NativeEdgeSegment[];
}

type EdgeVisual = ParallelEdgeVisual | NativeEdgeVisual;

interface CachedRoute {
	signature: string;
	route: ParallelCanvasRoute;
	path?: Path2D;
}

interface VisibleRoute {
	visual: EdgeVisual;
	route: ParallelCanvasRoute;
	path?: Path2D;
	metrics: EdgeVisualMetrics;
}

export interface NativeEdgeSegmentDescriptor {
	runtimeEdgeId: string;
	source: string;
	target: string;
}

export interface OrderedNativeEdgeSegmentDescriptor extends NativeEdgeSegmentDescriptor {
	reversed: boolean;
}

export interface ParallelEdgeLayerState {
	activeHoverNodeId?: string;
	selectedEdgeId?: string;
	hoveredEdgeId?: string;
	selectedEdgeColor: string;
	mutedEdgeColor: string;
}

export class SigmaParallelEdgeLayer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private readonly routeCache = new Map<string, CachedRoute>();
	private readonly hitGrid = new Map<string, VisibleRoute[]>();
	private flowRouteIndexGraph?: RuntimeGraph;
	private flowRouteIndex = new Map<string, FlowRouteCandidate>();
	private edgeVisualIndex?: EdgeVisualIndex;
	private visibleRoutes: VisibleRoute[] = [];
	private hoveredEdgeId?: string;
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
	}

	invalidate(): void {
		this.routeCache.clear();
		this.flowRouteIndexGraph = undefined;
		this.flowRouteIndex.clear();
		this.edgeVisualIndex = undefined;
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
			const tolerance = candidate.metrics.hitWidth / 2;
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

		const state = this.getState();
		const hoveredEdgeId = this.hoveredEdgeId ?? state.hoveredEdgeId;
		const graph = this.getGraph();
		const edgeIndex = this.getEdgeVisualIndex(graph);
		const focusBackground =
			state.activeHoverNodeId || state.selectedEdgeId || hoveredEdgeId
				? readCanvasBackgroundColor(this.sigma.getContainer())
				: undefined;
		const visuals = sortEdgeVisuals(
			[
				...collectParallelEdgeVisuals(graph, edgeIndex.canvasEdgeIds),
				...collectNativeFocusEdgeVisuals(
					graph,
					state,
					hoveredEdgeId,
					edgeIndex,
				),
			],
			state,
			hoveredEdgeId,
		);
		const pixelRatio = this.getPixelRatio();
		const visibleRoutes: VisibleRoute[] = [];
		for (const visual of visuals) {
			const metricOptions = {
				edgeSize: visual.attributes.size,
				arrowSize: visual.attributes.arrowSize,
				arrowStyle: visual.attributes.arrowStyle,
				lineStyle: visual.attributes.lineStyle,
				scaleSize: (size) => this.sigma.scaleSize(size),
				minEdgeThickness: this.sigma.getSetting('minEdgeThickness'),
				antiAliasingFeather: this.sigma.getSetting(
					'antiAliasingFeather',
				),
				pixelRatio,
			} satisfies EdgeVisualMetricsOptions;
			const routeMetrics = resolveEdgeVisualMetrics(metricOptions);
			const emphasis = getEdgeEmphasis(visual, state, hoveredEdgeId);
			const metrics = resolveEdgeVisualMetrics({
				...metricOptions,
				edgeSize: visual.attributes.size + emphasis,
			});
			const cached =
				visual.kind === 'canvas'
					? this.getRoute(visual, routeMetrics)
					: this.getNativeRoute(visual);
			if (
				!cached ||
				!intersectsViewport(cached.route.bounds, width, height)
			) {
				continue;
			}
			const visible = {
				visual,
				route: cached.route,
				path: cached.path,
				metrics,
			};
			visibleRoutes.push(visible);
			if (visual.kind === 'canvas') {
				this.indexRoute(visible);
			}
		}
		this.visibleRoutes = visibleRoutes;
		this.drawVisibleRoutes(visibleRoutes, focusBackground);
		this.canvas.hidden = this.visibleRoutes.length === 0;
	}

	kill(): void {
		this.cancelScheduledUpdate();
		this.sigma.off('afterRender', this.updateBound);
		const container = this.sigma.getContainer();
		container.removeEventListener('pointermove', this.handlePointerMove);
		container.removeEventListener('pointerleave', this.handlePointerLeave);
		this.routeCache.clear();
		this.flowRouteIndexGraph = undefined;
		this.flowRouteIndex.clear();
		this.edgeVisualIndex = undefined;
		this.hitGrid.clear();
		this.sigma.killLayer(LAYER_ID);
	}

	private getRoute(
		visual: ParallelEdgeVisual,
		metrics: EdgeVisualMetrics,
	): CachedRoute | undefined {
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
		const laneOffset =
			getCanonicalParallelLane(visual.attributes) * metrics.laneStep;
		const flowRoute = readLogicalFlowRoute(
			graph,
			visual,
			this.getFlowRouteIndex(graph),
		);
		const axis = this.readRouteAxis(
			visual,
			source,
			target,
			flowRoute?.direction,
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
			flowRoute?.direction ?? '',
			...(flowRoute?.route.flatMap((point) => [point.x, point.y]) ?? []),
		].join('|');
		const cacheKey = `canvas:${visual.edgeId}`;
		const existing = this.routeCache.get(cacheKey);
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
		this.routeCache.set(cacheKey, cached);
		return cached;
	}

	private getNativeRoute(visual: NativeEdgeVisual): CachedRoute | undefined {
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
		const orderedDescriptors = orderNativeEdgeSegments(
			visual.segments,
			visual.source,
			visual.target,
		);
		const segmentById = new Map(
			visual.segments.map((segment) => [segment.runtimeEdgeId, segment]),
		);
		const orderedSegments = orderedDescriptors
			.map((descriptor) => {
				const segment = segmentById.get(descriptor.runtimeEdgeId);
				return segment
					? { segment, reversed: descriptor.reversed }
					: undefined;
			})
			.filter(
				(
					entry,
				): entry is {
					segment: NativeEdgeSegment;
					reversed: boolean;
				} => Boolean(entry),
			);
		const firstOrdered = orderedSegments[0];
		const lastOrdered = orderedSegments.at(-1);
		const firstStart = firstOrdered
			? firstOrdered.reversed
				? firstOrdered.segment.target
				: firstOrdered.segment.source
			: undefined;
		const lastEnd = lastOrdered
			? lastOrdered.reversed
				? lastOrdered.segment.source
				: lastOrdered.segment.target
			: undefined;
		const completeRoute =
			orderedSegments.length === visual.segments.length &&
			firstStart === visual.source &&
			lastEnd === visual.target;
		if (!completeRoute) {
			return this.getDirectNativeRoute(
				visual,
				source,
				target,
				sourceRadius,
				targetRadius,
			);
		}
		const rawPoints: ViewportPoint[] = [];
		const viewportPointByNode = new Map<string, ViewportPoint>();
		const readNodePoint = (nodeId: string): ViewportPoint | undefined => {
			const cached = viewportPointByNode.get(nodeId);
			if (cached) return cached;
			if (!graph.hasNode(nodeId)) return undefined;
			const point = this.sigma.graphToViewport(
				graph.getNodeAttributes(nodeId),
			);
			viewportPointByNode.set(nodeId, point);
			return point;
		};
		for (const { segment, reversed } of orderedSegments) {
			const startNode = reversed ? segment.target : segment.source;
			const endNode = reversed ? segment.source : segment.target;
			const start = readNodePoint(startNode);
			const end = readNodePoint(endNode);
			if (!start || !end) {
				return this.getDirectNativeRoute(
					visual,
					source,
					target,
					sourceRadius,
					targetRadius,
				);
			}
			if (rawPoints.length === 0) rawPoints.push(start);
			else if (!sameViewportPoint(rawPoints.at(-1)!, start)) {
				rawPoints.push(start);
			}
			rawPoints.push(end);
		}
		const routePoints = clipContinuousRouteEndpoints(
			rawPoints,
			source,
			target,
			sourceRadius,
			targetRadius,
		);
		if (routePoints.length < 2) {
			return undefined;
		}
		const arrowSegment = [...orderedSegments]
			.reverse()
			.find(
				({ segment }) =>
					segment.directed &&
					(segment.attributes.flowArrowSegment === true ||
						isArrowEdgeType(segment.attributes.type)),
			);
		const finalPoint = routePoints.at(-1);
		const finalPrevious = routePoints.at(-2);
		const finalDirection =
			finalPoint && finalPrevious
				? normalizeVector({
						x: finalPoint.x - finalPrevious.x,
						y: finalPoint.y - finalPrevious.y,
					})
				: undefined;
		let arrowTip = finalPoint;
		let arrowDirection =
			finalDirection ??
			normalize({
				x: target.x - source.x,
				y: target.y - source.y,
			});
		if (arrowSegment) {
			const { segment, reversed } = arrowSegment;
			const startNode = reversed ? segment.target : segment.source;
			const endNode = reversed ? segment.source : segment.target;
			const arrowStart = readNodePoint(startNode);
			const arrowEnd = readNodePoint(endNode);
			const direction =
				arrowStart && arrowEnd
					? normalizeVector({
							x: arrowEnd.x - arrowStart.x,
							y: arrowEnd.y - arrowStart.y,
						})
					: undefined;
			if (direction) arrowDirection = direction;
			if (endNode === visual.target) arrowTip = routePoints.at(-1);
			else arrowTip = arrowEnd ?? arrowTip;
		}
		const signature = [
			'native',
			visual.edgeId,
			source.x,
			source.y,
			target.x,
			target.y,
			sourceRadius,
			targetRadius,
			...orderedDescriptors.flatMap((descriptor) => [
				descriptor.runtimeEdgeId,
				descriptor.source,
				descriptor.target,
				descriptor.reversed ? 1 : 0,
			]),
			...rawPoints.flatMap((point) => [point.x, point.y]),
		].join('|');
		const cacheKey = `native:${visual.edgeId}`;
		const existing = this.routeCache.get(cacheKey);
		if (existing?.signature === signature) {
			return existing;
		}
		const route: ParallelCanvasRoute = {
			points: routePoints,
			arrowDirection,
			arrowTip,
			bounds: boundsOf(routePoints),
		};
		const cached: CachedRoute = {
			signature,
			route,
			path: createPath(route.points),
		};
		this.routeCache.set(cacheKey, cached);
		return cached;
	}

	private getDirectNativeRoute(
		visual: NativeEdgeVisual,
		source: ViewportPoint,
		target: ViewportPoint,
		sourceRadius: number,
		targetRadius: number,
	): CachedRoute | undefined {
		const signature = [
			'native-fallback',
			visual.edgeId,
			source.x,
			source.y,
			target.x,
			target.y,
			sourceRadius,
			targetRadius,
		].join('|');
		const cacheKey = `native:${visual.edgeId}`;
		const existing = this.routeCache.get(cacheKey);
		if (existing?.signature === signature) return existing;
		const route = createParallelCanvasRoute(
			source,
			target,
			sourceRadius,
			targetRadius,
			0,
			{ x: target.x - source.x, y: target.y - source.y },
		);
		if (!route) return undefined;
		const cached: CachedRoute = {
			signature,
			route,
			path: createPath(route.points),
		};
		this.routeCache.set(cacheKey, cached);
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

	private getEdgeVisualIndex(graph: RuntimeGraph): EdgeVisualIndex {
		if (this.edgeVisualIndex?.graph === graph) {
			return this.edgeVisualIndex;
		}
		this.edgeVisualIndex = createEdgeVisualIndex(graph);
		return this.edgeVisualIndex;
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
			// The layout direction is authoritative for every Flow edge, including
			// undirected links that have no native arrow segment to infer an axis
			// from. This keeps RL/LR lanes on the side ports instead of falling back
			// to a diagonal node-to-node vector.
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

	private drawVisibleRoutes(
		visibleRoutes: readonly VisibleRoute[],
		focusBackground?: string,
	): void {
		const state = this.getState();
		const hoveredEdgeId = this.hoveredEdgeId ?? state.hoveredEdgeId;
		const buckets: VisibleRoute[][] = [[], [], [], []];
		for (const visible of visibleRoutes) {
			const priority = getEdgeFocusPriority(
				getEdgeFocusDescriptor(visible.visual),
				state,
				hoveredEdgeId,
			);
			buckets[priority]!.push(visible);
		}
		for (const bucket of buckets) {
			if (focusBackground) {
				for (const visible of bucket) {
					const descriptor = getEdgeFocusDescriptor(visible.visual);
					if (
						getEdgeFocusPriority(
							descriptor,
							state,
							hoveredEdgeId,
						) === 0
					) {
						continue;
					}
					const opacity = Math.max(
						0,
						Math.min(1, visible.visual.attributes.opacity ?? 1),
					);
					this.drawFocusShield(visible, opacity, focusBackground);
				}
			}
			for (const visible of bucket) {
				this.drawActualRoute(
					visible,
					visible.visual.kind === 'canvas',
					hoveredEdgeId,
				);
			}
		}
	}

	private drawActualRoute(
		visible: VisibleRoute,
		drawLabel: boolean,
		hoveredEdgeId?: string,
	): void {
		const { visual } = visible;
		const attributes = visual.attributes;
		const state = this.getState();
		const descriptor = getEdgeFocusDescriptor(visual);
		const selected = edgeMatchesId(descriptor, state.selectedEdgeId);
		const connectedToHover =
			selected ||
			edgeMatchesId(descriptor, hoveredEdgeId) ||
			!state.activeHoverNodeId ||
			isEdgeConnectedToNode(descriptor, state.activeHoverNodeId);
		const opacity = Math.max(0, Math.min(1, attributes.opacity ?? 1));

		this.context.save();
		this.context.globalAlpha = connectedToHover ? opacity : opacity * 0.18;
		this.context.strokeStyle = connectedToHover
			? selected
				? state.selectedEdgeColor
				: attributes.color
			: state.mutedEdgeColor;
		this.context.lineWidth = visible.metrics.lineWidth;
		this.context.lineCap = 'round';
		this.context.lineJoin = 'round';
		this.context.setLineDash(visible.metrics.dashPattern);
		this.strokeRoute(visible);
		this.context.setLineDash([]);
		if (visual.directed) {
			this.drawArrow(visible);
		}
		if (drawLabel && attributes.label) {
			this.drawLabel(visible);
		}
		this.context.restore();
	}

	private strokeRoute(visible: VisibleRoute): void {
		if (visible.path) {
			this.context.stroke(visible.path);
		} else {
			tracePolyline(this.context, visible.route.points);
			this.context.stroke();
		}
	}

	private drawFocusShield(
		visible: VisibleRoute,
		opacity: number,
		background: string,
	): void {
		this.context.save();
		this.context.globalAlpha = opacity;
		this.context.strokeStyle = background;
		this.context.lineWidth =
			visible.metrics.lineWidth + FOCUS_EDGE_CLEARANCE_PX * 2;
		this.context.lineCap = 'round';
		this.context.lineJoin = 'round';
		this.context.setLineDash([]);
		this.strokeRoute(visible);
		this.context.restore();
	}

	private drawArrow(visible: VisibleRoute): void {
		const { attributes } = visible.visual;
		const points = visible.route.points;
		const tip = visible.route.arrowTip ?? points.at(-1);
		if (!tip) return;
		const direction = visible.route.arrowDirection;
		const normal = { x: -direction.y, y: direction.x };
		const length = visible.metrics.arrowLength;
		const halfWidth = visible.metrics.arrowHalfWidth;
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
			this.drawChevronArrow(tip, left, right);
			return;
		}
		this.context.closePath();
		this.context.fillStyle = this.context.strokeStyle;
		this.context.fill();
	}

	private drawChevronArrow(
		tip: ViewportPoint,
		left: ViewportPoint,
		right: ViewportPoint,
	): void {
		const leftBaseInner = interpolateViewport(
			left,
			right,
			EDGE_CHEVRON_WING_RATIO,
		);
		const leftTipInner = interpolateViewport(
			tip,
			right,
			EDGE_CHEVRON_WING_RATIO,
		);
		const rightBaseInner = interpolateViewport(
			right,
			left,
			EDGE_CHEVRON_WING_RATIO,
		);
		const rightTipInner = interpolateViewport(
			tip,
			left,
			EDGE_CHEVRON_WING_RATIO,
		);
		this.context.fillStyle = this.context.strokeStyle;
		this.context.beginPath();
		this.context.moveTo(tip.x, tip.y);
		this.context.lineTo(left.x, left.y);
		this.context.lineTo(leftBaseInner.x, leftBaseInner.y);
		this.context.lineTo(leftTipInner.x, leftTipInner.y);
		this.context.closePath();
		this.context.fill();
		this.context.beginPath();
		this.context.moveTo(tip.x, tip.y);
		this.context.lineTo(right.x, right.y);
		this.context.lineTo(rightBaseInner.x, rightBaseInner.y);
		this.context.lineTo(rightTipInner.x, rightTipInner.y);
		this.context.closePath();
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
		const bounds = expandBounds(
			route.route.bounds,
			route.metrics.hitWidth / 2,
		);
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
		const ratio = this.getPixelRatio();
		const pixelWidth = Math.round(width * ratio);
		const pixelHeight = Math.round(height * ratio);
		if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
		if (this.canvas.height !== pixelHeight)
			this.canvas.height = pixelHeight;
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;
		this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
	}

	private getPixelRatio(): number {
		// Must match Sigma exactly: capping DPR makes the browser resample this
		// Canvas layer while native WebGL edges remain at full device resolution.
		const ratio =
			this.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
		return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
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
 * at each endpoint. Cubic transitions remove the right-angle hook caused
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
	const firstNext = shifted[1]!;
	const lastIndex = shifted.length - 1;
	const lastPrevious = shifted[lastIndex - 1]!;
	const sourceTip = createDirectionalPort(
		source,
		Math.max(0, sourceRadius),
		axis,
		true,
	);
	const targetTip = createDirectionalPort(
		target,
		Math.max(0, targetRadius),
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

/**
 * Attaches an axis-aligned route to side-center node ports. Lane separation is
 * introduced only after a short outward stub, so the node boundary never
 * becomes a top/bottom port for horizontal Flow routes (or left/right for
 * vertical Flow routes).
 */
function clipRouteEndpoints(
	points: readonly ViewportPoint[],
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
	axis: ViewportPoint,
): ViewportPoint[] {
	if (points.length < 2) return points.map((point) => ({ ...point }));
	const shifted = points.map((point) => ({ ...point }));
	const lastIndex = shifted.length - 1;
	if (shifted.length === 2) {
		return deduplicateViewportPoints([
			createDirectionalPort(
				source,
				Math.max(0, sourceRadius),
				axis,
				true,
			),
			createDirectionalPort(
				target,
				Math.max(0, targetRadius),
				axis,
				false,
			),
		]);
	}
	const firstCorridor = shifted[1]!;
	const lastCorridor = shifted[lastIndex - 1]!;
	const sourcePort = createDirectionalPort(
		source,
		Math.max(0, sourceRadius),
		axis,
		true,
	);
	const targetPort = createDirectionalPort(
		target,
		Math.max(0, targetRadius),
		axis,
		false,
	);
	const available = Math.max(0, dotAlongAxis(targetPort, sourcePort, axis));
	const sourceReach = Math.max(
		0,
		dotAlongAxis(firstCorridor, sourcePort, axis),
	);
	const targetReach = Math.max(
		0,
		dotAlongAxis(targetPort, lastCorridor, axis),
	);
	const stub = Math.min(
		ENDPOINT_STUB_PX,
		available / 4,
		sourceReach / 2,
		targetReach / 2,
	);
	const sourceStub = add(sourcePort, scale(axis, stub));
	const targetStub = add(targetPort, scale(axis, -stub));
	const sourceFanout = connectDirectionalPort(
		sourceStub,
		firstCorridor,
		axis,
	);
	const targetFanout = connectDirectionalPort(targetStub, lastCorridor, axis);
	return deduplicateViewportPoints([
		sourcePort,
		sourceStub,
		sourceFanout,
		...shifted.slice(1, -1),
		targetFanout,
		targetStub,
		targetPort,
	]);
}

function createDirectionalPort(
	center: ViewportPoint,
	radius: number,
	axis: ViewportPoint,
	source: boolean,
): ViewportPoint {
	return {
		x: center.x + (source ? axis.x : -axis.x) * radius,
		y: center.y + (source ? axis.y : -axis.y) * radius,
	};
}

function connectDirectionalPort(
	port: ViewportPoint,
	corridor: ViewportPoint,
	axis: ViewportPoint,
): ViewportPoint {
	if (Math.abs(axis.x) >= Math.abs(axis.y)) {
		return { x: port.x, y: corridor.y };
	}
	return { x: corridor.x, y: port.y };
}

function dotAlongAxis(
	point: ViewportPoint,
	reference: ViewportPoint,
	axis: ViewportPoint,
): number {
	return (point.x - reference.x) * axis.x + (point.y - reference.y) * axis.y;
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

/** Orders runtime segments into one logical path and records reversals. */
export function orderNativeEdgeSegments(
	segments: readonly NativeEdgeSegmentDescriptor[],
	source: string,
	target: string,
): OrderedNativeEdgeSegmentDescriptor[] {
	const remaining = [...segments].sort((left, right) =>
		left.runtimeEdgeId.localeCompare(right.runtimeEdgeId),
	);
	const ordered: OrderedNativeEdgeSegmentDescriptor[] = [];
	let current = source;
	while (remaining.length > 0) {
		const forwardIndex = remaining.findIndex(
			(segment) => segment.source === current,
		);
		const reverseIndex =
			forwardIndex >= 0
				? -1
				: remaining.findIndex((segment) => segment.target === current);
		const selectedIndex = forwardIndex >= 0 ? forwardIndex : reverseIndex;
		if (selectedIndex < 0) break;
		const selected = remaining.splice(selectedIndex, 1)[0]!;
		const reversed = selectedIndex === reverseIndex;
		ordered.push({ ...selected, reversed });
		current = reversed ? selected.source : selected.target;
		if (current === target) break;
	}
	return ordered;
}

/** Clips only the true logical endpoints; bend points stay in the path. */
function clipContinuousRouteEndpoints(
	points: readonly ViewportPoint[],
	source: ViewportPoint,
	target: ViewportPoint,
	sourceRadius: number,
	targetRadius: number,
): ViewportPoint[] {
	const normalized = deduplicateViewportPoints(points);
	if (normalized.length < 2) return normalized;
	const direct = normalizeVector({
		x: target.x - source.x,
		y: target.y - source.y,
	}) ?? { x: 1, y: 0 };
	const first = normalized[0]!;
	const firstNext = normalized[1]!;
	const last = normalized.at(-1)!;
	const lastPrevious = normalized[normalized.length - 2]!;
	const firstDirection =
		normalizeVector({
			x: firstNext.x - first.x,
			y: firstNext.y - first.y,
		}) ?? direct;
	const lastDirection =
		normalizeVector({
			x: last.x - lastPrevious.x,
			y: last.y - lastPrevious.y,
		}) ?? direct;
	const sourceInset = Math.min(
		Math.max(0, sourceRadius),
		distanceBetweenViewport(source, firstNext) * 0.45,
	);
	const targetInset = Math.min(
		Math.max(0, targetRadius),
		distanceBetweenViewport(target, lastPrevious) * 0.45,
	);
	return deduplicateViewportPoints([
		add(source, scale(firstDirection, sourceInset)),
		...normalized.slice(1, -1),
		add(target, scale(lastDirection, -targetInset)),
	]);
}

function sameViewportPoint(left: ViewportPoint, right: ViewportPoint): boolean {
	return (
		Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001
	);
}

function distanceSquared(
	left: ViewportPoint,
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
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

interface EdgeVisualIndex {
	graph: RuntimeGraph;
	canvasEdgeIds: string[];
	edgeIdsByNode: Map<string, string[]>;
	edgeIdsByLogicalId: Map<string, string[]>;
}

function createEdgeVisualIndex(graph: RuntimeGraph): EdgeVisualIndex {
	const index: EdgeVisualIndex = {
		graph,
		canvasEdgeIds: [],
		edgeIdsByNode: new Map(),
		edgeIdsByLogicalId: new Map(),
	};
	graph.forEachEdge((runtimeEdgeId, attributes, source, target) => {
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
		appendIndexedEdge(index.edgeIdsByNode, logicalSource, runtimeEdgeId);
		if (logicalTarget !== logicalSource) {
			appendIndexedEdge(
				index.edgeIdsByNode,
				logicalTarget,
				runtimeEdgeId,
			);
		}
		const edgeId = attributes.logicalEdgeId ?? runtimeEdgeId;
		appendIndexedEdge(index.edgeIdsByLogicalId, edgeId, runtimeEdgeId);
		if (edgeId !== runtimeEdgeId) {
			appendIndexedEdge(
				index.edgeIdsByLogicalId,
				runtimeEdgeId,
				runtimeEdgeId,
			);
		}
		if (isCanvasParallelEdge(attributes, [source, target])) {
			index.canvasEdgeIds.push(runtimeEdgeId);
		}
	});
	return index;
}

function appendIndexedEdge(
	index: Map<string, string[]>,
	key: string,
	edgeId: string,
): void {
	const edgeIds = index.get(key) ?? [];
	edgeIds.push(edgeId);
	index.set(key, edgeIds);
}

function collectParallelEdgeVisuals(
	graph: RuntimeGraph,
	runtimeEdgeIds: readonly string[] = graph.edges(),
): ParallelEdgeVisual[] {
	const visuals = new Map<string, ParallelEdgeVisual>();
	for (const runtimeEdgeId of runtimeEdgeIds) {
		if (!graph.hasEdge(runtimeEdgeId)) continue;
		const attributes = graph.getEdgeAttributes(runtimeEdgeId);
		const source = graph.source(runtimeEdgeId);
		const target = graph.target(runtimeEdgeId);
		if (
			attributes.hidden ||
			!isCanvasParallelEdge(attributes, [source, target])
		) {
			continue;
		}
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
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
			continue;
		}
		visuals.set(edgeId, {
			kind: 'canvas',
			edgeId,
			runtimeEdgeIds: [runtimeEdgeId],
			source: logicalSource,
			target: logicalTarget,
			attributes,
			directed: graph.isDirected(runtimeEdgeId),
		});
	}
	return [...visuals.values()];
}

function collectNativeFocusEdgeVisuals(
	graph: RuntimeGraph,
	state: ParallelEdgeLayerState,
	hoveredEdgeId?: string,
	index?: EdgeVisualIndex,
): NativeEdgeVisual[] {
	const visuals = new Map<string, NativeEdgeVisual>();
	for (const runtimeEdgeId of collectNativeFocusEdgeIds(
		state,
		hoveredEdgeId,
		index,
	)) {
		if (!graph.hasEdge(runtimeEdgeId)) continue;
		const attributes = graph.getEdgeAttributes(runtimeEdgeId);
		const source = graph.source(runtimeEdgeId);
		const target = graph.target(runtimeEdgeId);
		if (
			attributes.hidden ||
			isCanvasParallelEdge(attributes, [source, target])
		) {
			continue;
		}
		const edgeId = attributes.logicalEdgeId ?? runtimeEdgeId;
		const logicalSource = attributes.logicalSource ?? source;
		const logicalTarget = attributes.logicalTarget ?? target;
		const segment: NativeEdgeSegment = {
			runtimeEdgeId,
			source,
			target,
			attributes,
			directed: graph.isDirected(runtimeEdgeId),
		};
		const existing = visuals.get(edgeId);
		if (existing) {
			existing.segments.push(segment);
			if (
				isArrowEdgeType(attributes.type) &&
				!isArrowEdgeType(existing.attributes.type)
			) {
				existing.attributes = attributes;
			}
			continue;
		}
		const visual: NativeEdgeVisual = {
			kind: 'native',
			edgeId,
			source: logicalSource,
			target: logicalTarget,
			attributes,
			directed:
				segment.directed &&
				(attributes.flowArrowSegment === true ||
					isArrowEdgeType(attributes.type)),
			segments: [segment],
		};
		visuals.set(edgeId, visual);
	}
	for (const visual of visuals.values()) {
		visual.directed = visual.segments.some(
			(segment) =>
				segment.directed &&
				(segment.attributes.flowArrowSegment === true ||
					isArrowEdgeType(segment.attributes.type)),
		);
	}
	return [...visuals.values()].filter(
		(visual) =>
			getEdgeFocusPriority(
				getEdgeFocusDescriptor(visual),
				state,
				hoveredEdgeId,
			) > 0,
	);
}

function collectNativeFocusEdgeIds(
	state: ParallelEdgeLayerState,
	hoveredEdgeId: string | undefined,
	index?: EdgeVisualIndex,
): Set<string> {
	const candidateIds = new Set<string>();
	if (!index) return candidateIds;
	if (state.activeHoverNodeId) {
		for (const edgeId of index.edgeIdsByNode.get(state.activeHoverNodeId) ??
			[]) {
			candidateIds.add(edgeId);
		}
	}
	for (const edgeId of [state.selectedEdgeId, hoveredEdgeId]) {
		if (!edgeId) continue;
		for (const runtimeEdgeId of index.edgeIdsByLogicalId.get(edgeId) ??
			[]) {
			candidateIds.add(runtimeEdgeId);
		}
	}
	return candidateIds;
}

export interface EdgeFocusDescriptor {
	edgeId: string;
	source: string;
	target: string;
	logicalEdgeId?: string;
	logicalSource?: string;
	logicalTarget?: string;
}

function getEdgeFocusDescriptor(visual: EdgeVisual): EdgeFocusDescriptor {
	return {
		edgeId: visual.edgeId,
		source: visual.source,
		target: visual.target,
		logicalEdgeId: visual.attributes.logicalEdgeId,
		logicalSource: visual.attributes.logicalSource,
		logicalTarget: visual.attributes.logicalTarget,
	};
}

export function getEdgeFocusPriority(
	visual: EdgeFocusDescriptor,
	state: Pick<ParallelEdgeLayerState, 'activeHoverNodeId' | 'selectedEdgeId'>,
	hoveredEdgeId?: string,
): number {
	if (edgeMatchesId(visual, state.selectedEdgeId)) return 3;
	if (edgeMatchesId(visual, hoveredEdgeId)) return 2;
	if (isEdgeConnectedToNode(visual, state.activeHoverNodeId)) return 1;
	return 0;
}

function getEdgeEmphasis(
	visual: EdgeVisual,
	state: ParallelEdgeLayerState,
	hoveredEdgeId?: string,
): number {
	const descriptor = getEdgeFocusDescriptor(visual);
	if (
		edgeMatchesId(descriptor, state.selectedEdgeId) ||
		edgeMatchesId(descriptor, hoveredEdgeId)
	) {
		return 2;
	}
	return isEdgeConnectedToNode(descriptor, state.activeHoverNodeId) ? 1 : 0;
}

function edgeMatchesId(visual: EdgeFocusDescriptor, edgeId?: string): boolean {
	return Boolean(
		edgeId && (visual.edgeId === edgeId || visual.logicalEdgeId === edgeId),
	);
}

function isEdgeConnectedToNode(
	visual: EdgeFocusDescriptor,
	nodeId?: string,
): boolean {
	return Boolean(
		nodeId &&
		(visual.source === nodeId ||
			visual.target === nodeId ||
			visual.logicalSource === nodeId ||
			visual.logicalTarget === nodeId),
	);
}

function sortEdgeVisuals(
	visuals: readonly EdgeVisual[],
	state: ParallelEdgeLayerState,
	hoveredEdgeId?: string,
): EdgeVisual[] {
	const buckets: EdgeVisual[][] = [[], [], [], []];
	for (const visual of visuals) {
		const priority = getEdgeFocusPriority(
			getEdgeFocusDescriptor(visual),
			state,
			hoveredEdgeId,
		);
		buckets[priority]!.push(visual);
	}
	return buckets.flat();
}

function isArrowEdgeType(type: string): boolean {
	return type === 'arrow' || type.endsWith('-arrow');
}

function readCanvasBackgroundColor(container: HTMLElement): string {
	return (
		getComputedStyle(container)
			.getPropertyValue('--background-primary')
			.trim() || '#ffffff'
	);
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
		: {
				...candidate,
				route: candidate.route.map((point) => ({ ...point })),
			};
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
		if (attributes.hidden || !kind || !attributes.flowRoute?.length) {
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
	const fallbackSign = direction === 'RL' || direction === 'DT' ? -1 : 1;
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

function interpolateViewport(
	start: ViewportPoint,
	end: ViewportPoint,
	ratio: number,
): ViewportPoint {
	return {
		x: start.x + (end.x - start.x) * ratio,
		y: start.y + (end.y - start.y) * ratio,
	};
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
