import { GraphEvent } from '@antv/g6';
import type { RuntimeGraph } from '../../model/graphology-adapter';
import {
	isGraphPointInLayoutGroup,
	scaleLayoutGroupPadding,
	type FlowGroupGeometry,
	type LayoutGroupGeometry,
	type RadialGroupGeometry,
} from '../../../layouts/group-geometry';
import {
	fitViewportCircle,
	isViewportPointInGroup,
	normalizeGroupFrameForShape,
	type ViewportCircleMember,
	type ViewportGroupRect,
} from '../../../layouts/group-shape';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '../renderer-groups';

interface G6GroupViewport {
	on(event: GraphEvent, listener: () => void): unknown;
	off(event: GraphEvent, listener: () => void): unknown;
	getCanvas(): unknown;
}

interface G6SceneElement {
	appendChild(child: G6SceneElement): G6SceneElement;
	destroy(): void;
	setAttributes(attributes: Record<string, unknown>): void;
}

interface G6SceneDocument {
	createElement(
		tagName: string,
		options: { style: Record<string, unknown> },
	): G6SceneElement;
}

interface G6SceneCanvas {
	getRoot(
		layer?: 'background' | 'main' | 'label' | 'transient',
	): G6SceneElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const RADIAL_GROUP_LABEL_INSET = 15;
const RADIAL_SECTOR_SAMPLE_ANGLE = Math.PI / 36;
const HALO_DETAIL_LIMIT = 600;

export interface RadialSectorViewportShape {
	rect: ViewportGroupRect;
	points: Array<{ x: number; y: number }>;
	label: { x: number; y: number };
}

export interface G6GroupViewportMatrix {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

interface GroupMove {
	resize?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	group: GroupOverlayGroup;
	startGraph: { x: number; y: number };
	lastDelta: { x: number; y: number };
}

interface CachedRegion {
	groupId: string;
	name: string;
	color: string;
	shape: 'rect' | 'circle' | 'path';
	rect?: ViewportGroupRect;
	points?: Array<{ x: number; y: number }>;
	title: { x: number; y: number };
	uiScale: number;
	invertTextY: boolean;
	manualGroup?: GroupOverlayGroup;
}

interface CachedHalo {
	groupId: string;
	color: string;
	x: number;
	y: number;
	radius: number;
}

interface CanvasRegionElement {
	wrapper: G6SceneElement;
	shape: G6SceneElement;
}

export class G6GroupLayer {
	private readonly layer: SVGSVGElement;
	private readonly scene: SVGGElement;
	private readonly regionsLayer: SVGGElement;
	private readonly canvas: G6SceneCanvas;
	private readonly sceneDocument: G6SceneDocument;
	private readonly canvasRoot: G6SceneElement;
	private canvasRegions: G6SceneElement;
	private canvasHalos: G6SceneElement;
	private readonly activeDocument: Document;
	private groups: GroupOverlayGroup[] = [];
	private geometries: LayoutGroupGeometry[] = [];
	private callbacks: GroupInteractionCallbacks = {};
	private readonly groupFrames = new Map<string, ViewportGroupRect>();
	private readonly regions: CachedRegion[] = [];
	private readonly halos: CachedHalo[] = [];
	private readonly halosByGroup = new Map<string, CachedHalo[]>();
	private readonly members = new Map<string, Set<string>>();
	private readonly regionElements = new Map<string, CanvasRegionElement[]>();
	private readonly interactionRegionElements = new Map<
		string,
		SVGElement[]
	>();
	private readonly haloElements = new Map<string, G6SceneElement[]>();
	private geometryDirty = true;
	private renderQueued = false;
	private renderFrame?: number;
	private transformFrame?: number;
	private activeDropGroupId?: string;
	private selectedGroupId?: string;
	private hoveredGroupId?: string;
	private focusedNodeId?: string;
	private move?: GroupMove;

	private readonly handleTransform = (): void => {
		const window = this.activeDocument.defaultView;
		if (!window || this.transformFrame !== undefined) return;
		this.transformFrame = window.requestAnimationFrame(() => {
			this.transformFrame = undefined;
			this.updateTransform();
		});
	};

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.move) return;
		event.preventDefault();
		const delta = this.readMoveDelta(event);
		if (this.move.resize) {
			this.move.lastDelta = delta;
			this.invalidateGeometry();
			return;
		}
		const step = {
			x: delta.x - this.move.lastDelta.x,
			y: delta.y - this.move.lastDelta.y,
		};
		this.move.lastDelta = delta;
		if (step.x || step.y) {
			this.callbacks.onMovePreview?.(this.move.group.id, step);
			this.invalidateGeometry();
		}
	};

	private readonly handlePointerUp = (event: PointerEvent): void => {
		if (!this.move) return;
		event.preventDefault();
		const groupId = this.move.group.id;
		const delta = this.readMoveDelta(event);
		if (this.move.resize) {
			this.move.lastDelta = delta;
			const frame = this.readPreviewGroup(this.move.group);
			this.endMove();
			this.callbacks.onResizeCommit?.(groupId, frame);
			this.invalidateGeometry();
			return;
		}
		const step = {
			x: delta.x - this.move.lastDelta.x,
			y: delta.y - this.move.lastDelta.y,
		};
		if (step.x || step.y) this.callbacks.onMovePreview?.(groupId, step);
		this.callbacks.onMoveCommit?.(groupId, delta);
		this.endMove();
		this.callbacks.onMoveEnd?.(groupId);
		this.invalidateGeometry();
	};

	constructor(
		private readonly viewport: G6GroupViewport,
		private readonly container: HTMLElement,
		private readonly getGraph: () => RuntimeGraph,
		private readonly getNodePosition: (
			nodeId: string,
		) => { x: number; y: number } | undefined,
		private readonly graphToViewport: (position: {
			x: number;
			y: number;
		}) => { x: number; y: number },
		private readonly viewportToGraph: (position: {
			x: number;
			y: number;
		}) => { x: number; y: number },
		private readonly getNodeVisualScale: () => number = () => 1,
		private readonly graphToCanvas: (position: {
			x: number;
			y: number;
		}) => { x: number; y: number } = (position) => position,
	) {
		this.activeDocument = container.ownerDocument;
		const canvas = viewport.getCanvas() as G6SceneCanvas;
		this.canvas = canvas;
		this.sceneDocument = (canvas as unknown as Record<string, unknown>)[
			'document'
		] as G6SceneDocument;
		this.canvasRoot = this.sceneDocument.createElement('g', {
			style: { pointerEvents: 'none' },
		});
		this.canvasRegions = this.sceneDocument.createElement('g', {
			style: { pointerEvents: 'none' },
		});
		this.canvasHalos = this.sceneDocument.createElement('g', {
			style: { pointerEvents: 'none' },
		});
		this.canvasRoot.appendChild(this.canvasRegions);
		this.canvasRoot.appendChild(this.canvasHalos);
		this.canvas.getRoot('background').appendChild(this.canvasRoot);
		this.layer = this.svg('svg');
		this.layer.classList.add(
			'knowledge-workspace-group-layer',
			'knowledge-workspace-g6-group-layer',
			'knowledge-workspace-g6-group-interaction-layer',
		);
		this.layer.setAttribute('aria-hidden', 'true');
		this.scene = this.svg('g');
		this.scene.classList.add('knowledge-workspace-g6-group-scene');
		this.regionsLayer = this.svg('g');
		this.scene.append(this.regionsLayer);
		this.layer.appendChild(this.scene);
		container.appendChild(this.layer);
		viewport.on(GraphEvent.AFTER_TRANSFORM, this.handleTransform);
		this.updateTransform();
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks: GroupInteractionCallbacks = this.callbacks,
	): void {
		this.groups = groups.map((group) => ({
			...group,
			dynamicNodeIds: group.dynamicNodeIds
				? [...group.dynamicNodeIds]
				: undefined,
		}));
		this.callbacks = callbacks;
		this.rebuildMembers();
		this.invalidateGeometry();
	}

	setGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.geometries = geometries.map((geometry) => ({
			...geometry,
			nodeIds: [...geometry.nodeIds],
		}));
		if (getGroupNodeIds)
			this.callbacks = { ...this.callbacks, getGroupNodeIds };
		this.rebuildMembers();
		this.invalidateGeometry();
	}

	invalidateGeometry(): void {
		this.geometryDirty = true;
		this.scheduleRender();
	}

	refreshViewport(): void {
		this.handleTransform();
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		this.ensureCache();
		const point = this.viewportToGraph(position);
		let best: { id: string; area: number } | undefined;
		for (const group of this.groups) {
			const rect = this.groupFrames.get(group.id);
			if (!rect || !isViewportPointInGroup(point, rect, group.shape))
				continue;
			const area = rect.width * rect.height;
			if (!best || area < best.area) best = { id: group.id, area };
		}
		if (best) return best.id;
		return [...this.geometries]
			.reverse()
			.find((geometry) => isGraphPointInLayoutGroup(geometry, point))
			?.groupId;
	}

	setActiveDropGroup(groupId?: string): void {
		if (this.activeDropGroupId === groupId) return;
		this.activeDropGroupId = groupId;
		this.updateStates();
	}
	setSelectedGroup(groupId?: string): void {
		if (this.selectedGroupId === groupId) return;
		this.selectedGroupId = groupId;
		this.ensureCache();
		this.renderCanvasRegions();
		this.updateStates();
	}
	setHoveredGroup(groupId?: string): void {
		if (this.hoveredGroupId === groupId) return;
		this.hoveredGroupId = groupId;
		this.updateStates();
	}
	setFocusedNode(nodeId?: string): void {
		if (this.focusedNodeId === nodeId) return;
		const previousNodeId = this.focusedNodeId;
		this.focusedNodeId = nodeId;
		this.updateFocusStates(previousNodeId, nodeId);
	}

	update(): void {
		this.renderQueued = false;
		this.layer.style.display =
			this.groups.length === 0 && this.geometries.length === 0
				? 'none'
				: '';
		if (this.geometryDirty) {
			this.rebuildCache();
			this.renderCanvasRegions();
			this.renderInteractionRegions();
		}
		this.applyRegionStates();
		this.renderHalos();
	}

	kill(): void {
		this.endMove();
		const window = this.activeDocument.defaultView;
		if (this.renderFrame !== undefined)
			window?.cancelAnimationFrame(this.renderFrame);
		if (this.transformFrame !== undefined)
			window?.cancelAnimationFrame(this.transformFrame);
		this.viewport.off(GraphEvent.AFTER_TRANSFORM, this.handleTransform);
		this.layer.remove();
		this.canvasRoot.destroy();
		this.groupFrames.clear();
		this.regions.length = 0;
		this.halos.length = 0;
		this.halosByGroup.clear();
		this.members.clear();
		this.regionElements.clear();
		this.interactionRegionElements.clear();
		this.haloElements.clear();
	}

	private scheduleRender(): void {
		if (this.renderQueued) return;
		this.renderQueued = true;
		const window = this.activeDocument.defaultView;
		if (window) {
			this.renderFrame = window.requestAnimationFrame(() => {
				this.renderFrame = undefined;
				this.update();
			});
		} else queueMicrotask(() => this.update());
	}

	private updateTransform(): void {
		const m = createGraphViewportMatrix(this.graphToViewport);
		this.scene.setAttribute(
			'transform',
			`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
		);
	}

	private ensureCache(): void {
		if (this.geometryDirty) this.rebuildCache();
	}

	private rebuildCache(): void {
		this.geometryDirty = false;
		this.groupFrames.clear();
		this.regions.length = 0;
		this.halos.length = 0;
		this.halosByGroup.clear();
		const matrix = createGraphViewportMatrix(this.graphToViewport);
		const scale = readUniformViewportScale(matrix);
		const uiScale = this.getNodeVisualScale() / scale;
		const invertTextY = matrix.a * matrix.d - matrix.b * matrix.c < 0;
		for (const group of this.groups) {
			const preview = this.readPreviewGroup(group);
			const rect = preview.dynamicNodeIds
				? this.readDynamicGroupRect(preview)
				: groupFrameToRect(
						normalizeGroupFrameForShape(preview, preview.shape),
					);
			this.groupFrames.set(group.id, rect);
			this.regions.push({
				groupId: group.id,
				name: group.name,
				color: group.color,
				shape: group.shape === 'circle' ? 'circle' : 'rect',
				rect,
				title: createG6GroupTitlePosition(rect, uiScale, invertTextY),
				uiScale,
				invertTextY,
				manualGroup: group,
			});
		}
		const graph = this.getGraph();
		for (const geometry of this.geometries) {
			if (geometry.kind === 'flow-container') {
				const rect = {
					left: geometry.x,
					top: geometry.y,
					width: geometry.width,
					height: geometry.height,
				};
				this.regions.push({
					groupId: geometry.groupId,
					name: geometry.name,
					color: geometry.color,
					shape: 'rect',
					rect,
					title: createG6GroupTitlePosition(
						rect,
						uiScale,
						invertTextY,
					),
					uiScale,
					invertTextY,
				});
			} else if (geometry.kind === 'radial-sector') {
				const shape = createRadialSectorGraphShape(geometry);
				this.regions.push({
					groupId: geometry.groupId,
					name: geometry.name,
					color: geometry.color,
					shape: 'path',
					points: shape.points,
					title: shape.label,
					uiScale,
					invertTextY,
				});
			}
			for (const nodeId of geometry.nodeIds) {
				if (!graph.hasNode(nodeId)) continue;
				const attributes = graph.getNodeAttributes(nodeId);
				if (attributes.hidden || attributes.isBend) continue;
				const position = this.getNodePosition(nodeId);
				if (!position) continue;
				const halo = {
					groupId: geometry.groupId,
					color: geometry.color,
					...position,
					radius: Math.max(
						4 / scale,
						(attributes.size * this.getNodeVisualScale() + 3) /
							scale,
					),
				};
				this.halos.push(halo);
				const groupHalos =
					this.halosByGroup.get(geometry.groupId) ?? [];
				groupHalos.push(halo);
				this.halosByGroup.set(geometry.groupId, groupHalos);
			}
		}
	}

	private readDynamicGroupRect(group: GroupOverlayGroup): ViewportGroupRect {
		const graph = this.getGraph();
		const viewportScale = readUniformViewportScale(
			createGraphViewportMatrix(this.graphToViewport),
		);
		const visualScale = this.getNodeVisualScale();
		const unit = visualScale / viewportScale;
		const nodes: ViewportCircleMember[] = (
			group.dynamicNodeIds ?? []
		).flatMap((nodeId) => {
			if (!graph.hasNode(nodeId)) return [];
			const attributes = graph.getNodeAttributes(nodeId);
			const position = this.getNodePosition(nodeId);
			if (!position || attributes.hidden || attributes.isBend) return [];
			return [
				{ ...position, radius: Math.max(0, attributes.size * unit) },
			];
		});
		if (!nodes.length) return emptyRect();
		const padding = scaleLayoutGroupPadding(group.padding) * 40;
		if (group.shape === 'circle')
			return fitViewportCircle(nodes, (8 + padding * 0.5) * unit);
		const xPad = (12 + padding) * unit;
		const topPad = (24 + padding) * unit;
		const bottomPad = (12 + padding) * unit;
		let left =
			Math.min(...nodes.map((node) => node.x - node.radius)) - xPad;
		let right =
			Math.max(...nodes.map((node) => node.x + node.radius)) + xPad;
		const top =
			Math.min(...nodes.map((node) => node.y - node.radius)) - topPad;
		const bottom =
			Math.max(...nodes.map((node) => node.y + node.radius)) + bottomPad;
		const minWidth = Math.min(220, group.name.length * 6.5 + 20) * unit;
		if (right - left < minWidth) {
			const extra = (minWidth - right + left) / 2;
			left -= extra;
			right += extra;
		}
		return { left, top, width: right - left, height: bottom - top };
	}

	private renderCanvasRegions(): void {
		this.canvasRegions.destroy();
		this.regionElements.clear();
		const regions = this.sceneDocument.createElement('g', {
			style: { pointerEvents: 'none' },
		});
		this.canvasRoot.appendChild(regions);
		this.canvasRegions = regions;
		for (const region of this.regions) {
			const wrapper = this.sceneDocument.createElement('g', {
				style: { pointerEvents: 'none' },
			});
			const shape = this.createCanvasRegionShape(region);
			wrapper.appendChild(shape);
			this.appendCanvasTitle(wrapper, region);
			if (region.manualGroup?.resizable && region.rect)
				this.appendCanvasHandles(wrapper, region);
			regions.appendChild(wrapper);
			const elements = this.regionElements.get(region.groupId) ?? [];
			elements.push({ wrapper, shape });
			this.regionElements.set(region.groupId, elements);
		}
	}

	private createCanvasRegionShape(region: CachedRegion): G6SceneElement {
		const scale = this.readGraphToCanvasScale();
		const stateStyle = this.resolveRegionStyle(
			region.groupId,
			region.color,
			scale,
		);
		if (region.shape === 'path') {
			return this.sceneDocument.createElement('path', {
				style: {
					...stateStyle,
					d: createClosedPathData(
						(region.points ?? []).map((point) =>
							this.graphToCanvas(point),
						),
					),
				},
			});
		}
		const rect = this.toCanvasRect(region.rect ?? emptyRect());
		if (region.shape === 'circle') {
			return this.sceneDocument.createElement('ellipse', {
				style: {
					...stateStyle,
					cx: rect.left + rect.width / 2,
					cy: rect.top + rect.height / 2,
					rx: rect.width / 2,
					ry: rect.height / 2,
				},
			});
		}
		return this.sceneDocument.createElement('rect', {
			style: {
				...stateStyle,
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
				radius: 8 * region.uiScale * scale,
			},
		});
	}

	private appendCanvasTitle(
		wrapper: G6SceneElement,
		region: CachedRegion,
	): void {
		const point = this.graphToCanvas(region.title);
		const scale = region.uiScale * this.readGraphToCanvasScale();
		const width = Math.min(220, region.name.length * 6.5 + 20) * scale;
		wrapper.appendChild(
			this.sceneDocument.createElement('rect', {
				style: {
					x: point.x - width / 2,
					y: point.y - 10 * scale,
					width,
					height: 18 * scale,
					radius: 9 * scale,
					fill: this.readBackgroundColor(),
					fillOpacity: 0.94,
					stroke: region.color,
					strokeOpacity: 0.22,
					lineWidth: scale,
					pointerEvents: 'none',
				},
			}),
		);
		wrapper.appendChild(
			this.sceneDocument.createElement('text', {
				style: {
					x: point.x,
					y: point.y,
					text: region.name,
					fill: region.color,
					fontSize: 11 * scale,
					fontWeight: 600,
					textAlign: 'center',
					textBaseline: 'middle',
					pointerEvents: 'none',
				},
			}),
		);
	}

	private appendCanvasHandles(
		wrapper: G6SceneElement,
		region: CachedRegion,
	): void {
		if (!region.rect) return;
		const scale = region.uiScale * this.readGraphToCanvasScale();
		const selected = region.groupId === this.selectedGroupId;
		for (const point of [
			{ x: region.rect.left, y: region.rect.top },
			{ x: region.rect.left + region.rect.width, y: region.rect.top },
			{ x: region.rect.left, y: region.rect.top + region.rect.height },
			{
				x: region.rect.left + region.rect.width,
				y: region.rect.top + region.rect.height,
			},
		]) {
			const canvasPoint = this.graphToCanvas(point);
			wrapper.appendChild(
				this.sceneDocument.createElement('circle', {
					style: {
						cx: canvasPoint.x,
						cy: canvasPoint.y,
						r: 6 * scale,
						fill: this.readBackgroundColor(),
						stroke: region.color,
						lineWidth: scale,
						opacity: selected ? 1 : 0,
						pointerEvents: 'none',
					},
				}),
			);
		}
	}

	private renderInteractionRegions(): void {
		this.regionsLayer.replaceChildren();
		this.interactionRegionElements.clear();
		for (const region of this.regions) {
			const wrapper = this.svg('g');
			wrapper.classList.add('knowledge-workspace-g6-svg-region');
			wrapper.style.setProperty(
				'--knowledge-workspace-group-color',
				region.color,
			);
			const shape = this.svg(
				region.shape === 'path'
					? 'path'
					: region.shape === 'circle'
						? 'ellipse'
						: 'rect',
			);
			shape.classList.add('knowledge-workspace-g6-svg-region-shape');
			if (region.shape === 'path')
				shape.setAttribute(
					'd',
					createClosedPathData(region.points ?? []),
				);
			else if (region.rect && region.shape === 'circle') {
				shape.setAttribute(
					'cx',
					String(region.rect.left + region.rect.width / 2),
				);
				shape.setAttribute(
					'cy',
					String(region.rect.top + region.rect.height / 2),
				);
				shape.setAttribute('rx', String(region.rect.width / 2));
				shape.setAttribute('ry', String(region.rect.height / 2));
			} else if (region.rect) {
				shape.setAttribute('x', String(region.rect.left));
				shape.setAttribute('y', String(region.rect.top));
				shape.setAttribute('width', String(region.rect.width));
				shape.setAttribute('height', String(region.rect.height));
				shape.setAttribute('rx', String(8 * region.uiScale));
			}
			wrapper.append(shape, this.createTitle(region));
			if (region.manualGroup?.resizable && region.rect)
				this.appendHandles(wrapper, region.manualGroup, region.rect);
			this.regionsLayer.appendChild(wrapper);
			const elements =
				this.interactionRegionElements.get(region.groupId) ?? [];
			elements.push(wrapper);
			this.interactionRegionElements.set(region.groupId, elements);
		}
	}

	private createTitle(region: CachedRegion): SVGGElement {
		const title = this.svg('g');
		title.classList.add('knowledge-workspace-g6-svg-title');
		title.setAttribute(
			'transform',
			`translate(${region.title.x} ${region.title.y}) scale(${region.uiScale} ${region.invertTextY ? -region.uiScale : region.uiScale})`,
		);
		const width = Math.min(220, region.name.length * 6.5 + 20);
		const background = this.svg('rect');
		background.classList.add('knowledge-workspace-g6-svg-title-background');
		background.setAttribute('x', String(-width / 2));
		background.setAttribute('y', '-10');
		background.setAttribute('width', String(width));
		background.setAttribute('height', '18');
		background.setAttribute('rx', '9');
		const text = this.svg('text');
		text.classList.add('knowledge-workspace-g6-svg-title-text');
		text.setAttribute('x', '0');
		text.setAttribute('y', '3');
		text.textContent = region.name;
		title.append(background, text);
		if (region.manualGroup) {
			title.classList.add('interactive');
			title.addEventListener('pointerdown', (event) =>
				this.startMove(event, region.groupId),
			);
			title.addEventListener('contextmenu', (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.callbacks.onSelectGroup?.(region.groupId);
				this.callbacks.onContextMenu?.(region.groupId, event);
			});
		}
		return title;
	}

	private appendHandles(
		wrapper: SVGGElement,
		group: GroupOverlayGroup,
		rect: ViewportGroupRect,
	): void {
		for (const [direction, x, y] of [
			['top-left', rect.left, rect.top],
			['top-right', rect.left + rect.width, rect.top],
			['bottom-left', rect.left, rect.top + rect.height],
			['bottom-right', rect.left + rect.width, rect.top + rect.height],
		] as const) {
			const handle = this.svg('circle');
			handle.classList.add(
				'knowledge-workspace-g6-svg-resize',
				`resize-${direction}`,
			);
			handle.setAttribute('cx', String(x));
			handle.setAttribute('cy', String(y));
			handle.setAttribute('r', String(6 * this.readUiScale()));
			handle.addEventListener('pointerdown', (event) =>
				this.startMove(event, group.id, direction),
			);
			wrapper.appendChild(handle);
		}
	}

	private applyRegionStates(groupIds?: ReadonlySet<string>): void {
		for (const [groupId, elements] of this.regionElements) {
			if (!groupIds || groupIds.has(groupId)) {
				const region = this.regions.find(
					(item) => item.groupId === groupId,
				);
				if (!region) continue;
				for (const element of elements) {
					element.wrapper.setAttributes({
						opacity: this.isMuted(groupId) ? 0.58 : 1,
					});
					element.shape.setAttributes(
						this.resolveRegionStyle(
							groupId,
							region.color,
							this.readGraphToCanvasScale(),
						),
					);
				}
			}
		}
		for (const [groupId, elements] of this.interactionRegionElements) {
			if (groupIds && !groupIds.has(groupId)) continue;
			for (const element of elements) {
				element.classList.toggle(
					'selected',
					groupId === this.selectedGroupId,
				);
			}
		}
	}

	private renderHalos(): void {
		this.haloElements.clear();
		const detailed = this.halos.length <= HALO_DETAIL_LIMIT;
		const active = new Set<string>(
			[
				this.selectedGroupId,
				this.hoveredGroupId,
				this.activeDropGroupId,
			].filter((id): id is string => Boolean(id)),
		);
		for (const groupId of this.focusedGroups()) active.add(groupId);
		const candidates = detailed
			? this.halos
			: [...active].flatMap(
					(groupId) => this.halosByGroup.get(groupId) ?? [],
				);
		const batches = new Map<
			string,
			{
				groupId: string;
				color: string;
				muted: boolean;
				selected: boolean;
				paths: string[];
			}
		>();
		for (const halo of candidates) {
			const muted = this.isMuted(halo.groupId);
			const selected = halo.groupId === this.selectedGroupId;
			const key = `${halo.groupId}\0${halo.color}\0${muted}\0${selected}`;
			const batch = batches.get(key) ?? {
				groupId: halo.groupId,
				color: halo.color,
				muted,
				selected,
				paths: [],
			};
			const point = this.graphToCanvas(halo);
			batch.paths.push(
				createCirclePath({
					...point,
					radius: halo.radius * this.readGraphToCanvasScale(),
				}),
			);
			batches.set(key, batch);
		}
		this.canvasHalos.destroy();
		const halos = this.sceneDocument.createElement('g', {
			style: { pointerEvents: 'none' },
		});
		this.canvasRoot.appendChild(halos);
		this.canvasHalos = halos;
		for (const batch of batches.values()) {
			const scale = this.readGraphToCanvasScale();
			const path = this.sceneDocument.createElement('path', {
				style: {
					d: batch.paths.join(' '),
					fill: 'none',
					stroke: batch.color,
					strokeOpacity: batch.selected ? 0.9 : 0.72,
					lineWidth: (batch.selected ? 3 : 2) * scale,
					opacity: batch.muted ? 0.32 : 1,
					pointerEvents: 'none',
				},
			});
			halos.appendChild(path);
			const elements = this.haloElements.get(batch.groupId) ?? [];
			elements.push(path);
			this.haloElements.set(batch.groupId, elements);
		}
	}

	private updateFocusStates(
		previousNodeId?: string,
		nextNodeId?: string,
	): void {
		this.ensureCache();
		const previousGroups = this.focusedGroups(previousNodeId);
		const nextGroups = this.focusedGroups(nextNodeId);
		const affected = new Set<string>();
		if (!previousNodeId || !nextNodeId) {
			for (const groupId of this.members.keys()) affected.add(groupId);
			for (const groupId of this.regionElements.keys())
				affected.add(groupId);
			for (const groupId of this.haloElements.keys())
				affected.add(groupId);
		} else {
			for (const groupId of previousGroups)
				if (!nextGroups.has(groupId)) affected.add(groupId);
			for (const groupId of nextGroups)
				if (!previousGroups.has(groupId)) affected.add(groupId);
		}
		if (affected.size > 0) this.applyRegionStates(affected);
		if (this.halos.length > HALO_DETAIL_LIMIT) {
			this.renderHalos();
			return;
		}
		for (const groupId of affected)
			for (const element of this.haloElements.get(groupId) ?? [])
				element.setAttributes({
					opacity: this.isMuted(groupId) ? 0.32 : 1,
				});
	}

	private updateStates(): void {
		this.ensureCache();
		this.applyRegionStates();
		this.renderHalos();
	}

	private rebuildMembers(): void {
		this.members.clear();
		for (const group of this.groups)
			if (group.dynamicNodeIds) {
				this.members.set(group.id, new Set(group.dynamicNodeIds));
			}
		for (const geometry of this.geometries)
			this.members.set(geometry.groupId, new Set(geometry.nodeIds));
		if (this.callbacks.getGroupNodeIds)
			for (const group of this.groups) {
				this.members.set(
					group.id,
					new Set(this.callbacks.getGroupNodeIds(group.id)),
				);
			}
	}

	private focusedGroups(nodeId = this.focusedNodeId): Set<string> {
		const groups = new Set<string>();
		if (!nodeId) return groups;
		for (const [groupId, members] of this.members)
			if (members.has(nodeId)) groups.add(groupId);
		return groups;
	}

	private isMuted(groupId: string): boolean {
		return Boolean(
			this.focusedNodeId &&
			!this.members.get(groupId)?.has(this.focusedNodeId),
		);
	}

	private resolveRegionStyle(
		groupId: string,
		color: string,
		canvasScale: number,
	): Record<string, unknown> {
		const selected = groupId === this.selectedGroupId;
		const hovered = groupId === this.hoveredGroupId;
		const dropTarget = groupId === this.activeDropGroupId;
		return {
			fill: dropTarget ? this.readAccentColor() : color,
			fillOpacity: dropTarget
				? 0.18
				: selected
					? 0.12
					: hovered
						? 0.08
						: 0.06,
			stroke: dropTarget ? this.readAccentColor() : color,
			strokeOpacity: dropTarget
				? 1
				: selected
					? 0.9
					: hovered
						? 0.8
						: 0.55,
			lineWidth:
				(dropTarget ? 2.5 : selected ? 2 : hovered ? 1.75 : 1.5) *
				canvasScale,
			pointerEvents: 'none',
		};
	}

	private toCanvasRect(rect: ViewportGroupRect): ViewportGroupRect {
		const first = this.graphToCanvas({ x: rect.left, y: rect.top });
		const second = this.graphToCanvas({
			x: rect.left + rect.width,
			y: rect.top + rect.height,
		});
		return {
			left: Math.min(first.x, second.x),
			top: Math.min(first.y, second.y),
			width: Math.abs(second.x - first.x),
			height: Math.abs(second.y - first.y),
		};
	}

	private readGraphToCanvasScale(): number {
		const origin = this.graphToCanvas({ x: 0, y: 0 });
		const x = this.graphToCanvas({ x: 1, y: 0 });
		const y = this.graphToCanvas({ x: 0, y: 1 });
		return Math.max(
			1e-6,
			(Math.hypot(x.x - origin.x, x.y - origin.y) +
				Math.hypot(y.x - origin.x, y.y - origin.y)) /
				2,
		);
	}

	private readBackgroundColor(): string {
		return this.readCssColor('--background-primary', '#ffffff');
	}

	private readAccentColor(): string {
		return this.readCssColor('--interactive-accent', '#7c6cff');
	}

	private readCssColor(property: string, fallback: string): string {
		return (
			this.activeDocument.defaultView
				?.getComputedStyle(this.container)
				.getPropertyValue(property)
				.trim() || fallback
		);
	}

	private startMove(
		event: PointerEvent,
		groupId: string,
		resize?: GroupMove['resize'],
	): void {
		const group = this.groups.find((candidate) => candidate.id === groupId);
		if (
			!group ||
			event.button !== 0 ||
			(resize ? !group.resizable : group.movable === false)
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		this.callbacks.onSelectGroup?.(group.id);
		if (!resize) this.callbacks.onMoveStart?.(group.id);
		this.move = {
			resize,
			group: { ...group },
			startGraph: this.viewportToGraph(this.readViewportPoint(event)),
			lastDelta: { x: 0, y: 0 },
		};
		this.activeDocument.addEventListener(
			'pointermove',
			this.handlePointerMove,
		);
		this.activeDocument.addEventListener(
			'pointerup',
			this.handlePointerUp,
			{ once: true },
		);
	}

	private readPreviewGroup(group: GroupOverlayGroup): GroupOverlayGroup {
		const move = this.move;
		if (!move || move.group.id !== group.id || group.dynamicNodeIds)
			return group;
		const { x: dx, y: dy } = move.lastDelta;
		const base = move.group;
		if (!move.resize) return { ...base, x: base.x + dx, y: base.y + dy };
		const left = move.resize.endsWith('left');
		const top = move.resize.startsWith('top');
		const width = Math.max(20, base.width + (left ? -dx : dx));
		const height = Math.max(20, base.height + (top ? -dy : dy));
		const normalized = normalizeGroupFrameForShape(
			{ ...base, width, height },
			base.shape,
		);
		return {
			...base,
			...normalized,
			x: left ? base.x + base.width - normalized.width : base.x,
			y: top ? base.y + base.height - normalized.height : base.y,
		};
	}

	private endMove(): void {
		this.move = undefined;
		this.activeDocument.removeEventListener(
			'pointermove',
			this.handlePointerMove,
		);
		this.activeDocument.removeEventListener(
			'pointerup',
			this.handlePointerUp,
		);
	}

	private readMoveDelta(event: PointerEvent): { x: number; y: number } {
		if (!this.move) return { x: 0, y: 0 };
		const point = this.viewportToGraph(this.readViewportPoint(event));
		return {
			x: point.x - this.move.startGraph.x,
			y: point.y - this.move.startGraph.y,
		};
	}

	private readViewportPoint(event: PointerEvent): { x: number; y: number } {
		const rect = this.container.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	private svg<K extends keyof SVGElementTagNameMap>(
		name: K,
	): SVGElementTagNameMap[K] {
		return this.activeDocument.createElementNS(SVG_NS, name);
	}

	private readUiScale(): number {
		return (
			this.getNodeVisualScale() /
			readUniformViewportScale(
				createGraphViewportMatrix(this.graphToViewport),
			)
		);
	}
}

export function createGraphViewportMatrix(
	graphToViewport: (position: { x: number; y: number }) => {
		x: number;
		y: number;
	},
): G6GroupViewportMatrix {
	const origin = graphToViewport({ x: 0, y: 0 });
	const x = graphToViewport({ x: 1, y: 0 });
	const y = graphToViewport({ x: 0, y: 1 });
	return {
		a: x.x - origin.x,
		b: x.y - origin.y,
		c: y.x - origin.x,
		d: y.y - origin.y,
		e: origin.x,
		f: origin.y,
	};
}

function readUniformViewportScale(matrix: G6GroupViewportMatrix): number {
	return Math.max(
		1e-6,
		(Math.hypot(matrix.a, matrix.b) + Math.hypot(matrix.c, matrix.d)) / 2,
	);
}

function emptyRect(): ViewportGroupRect {
	return { left: 0, top: 0, width: 0, height: 0 };
}

function groupFrameToRect(frame: {
	x: number;
	y: number;
	width: number;
	height: number;
}): ViewportGroupRect {
	return {
		left: frame.x,
		top: frame.y,
		width: frame.width,
		height: frame.height,
	};
}

export function createG6GroupTitlePosition(
	rect: ViewportGroupRect,
	uiScale: number,
	invertY: boolean,
): { x: number; y: number } {
	return {
		x: rect.left + rect.width / 2,
		y: invertY
			? rect.top + rect.height - 12 * uiScale
			: rect.top + 12 * uiScale,
	};
}

function createCirclePath({
	x,
	y,
	radius,
}: Pick<CachedHalo, 'x' | 'y' | 'radius'>): string {
	return `M ${x - radius} ${y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

export function createFlowContainerViewportRect(
	geometry: FlowGroupGeometry,
	graphToViewport: (position: { x: number; y: number }) => {
		x: number;
		y: number;
	},
): ViewportGroupRect {
	const first = graphToViewport({ x: geometry.x, y: geometry.y });
	const second = graphToViewport({
		x: geometry.x + geometry.width,
		y: geometry.y + geometry.height,
	});
	return {
		left: Math.min(first.x, second.x),
		top: Math.min(first.y, second.y),
		width: Math.abs(second.x - first.x),
		height: Math.abs(second.y - first.y),
	};
}

function createRadialSectorGraphShape(
	geometry: RadialGroupGeometry,
): Pick<RadialSectorViewportShape, 'points' | 'label'> {
	const span = Math.max(0.001, geometry.endAngle - geometry.startAngle);
	const samples = Math.max(8, Math.ceil(span / RADIAL_SECTOR_SAMPLE_ANGLE));
	const angles = Array.from(
		{ length: samples + 1 },
		(_, index) => geometry.startAngle + (span * index) / samples,
	);
	const points = [
		...angles.map((angle) => radialPoint(angle, geometry.outerRadius)),
		...[...angles]
			.reverse()
			.map((angle) => radialPoint(angle, geometry.innerRadius)),
	];
	const middle = (geometry.startAngle + geometry.endAngle) / 2;
	const labelRadius = Math.max(
		geometry.innerRadius,
		geometry.outerRadius - RADIAL_GROUP_LABEL_INSET,
	);
	return { points, label: radialPoint(middle, labelRadius) };
}

export function createRadialSectorViewportShape(
	geometry: RadialGroupGeometry,
	graphToViewport: (position: { x: number; y: number }) => {
		x: number;
		y: number;
	},
): RadialSectorViewportShape {
	const graphShape = createRadialSectorGraphShape(geometry);
	const points = graphShape.points.map(graphToViewport);
	const padding = 2;
	const left = Math.min(...points.map((point) => point.x)) - padding;
	const right = Math.max(...points.map((point) => point.x)) + padding;
	const top = Math.min(...points.map((point) => point.y)) - padding;
	const bottom = Math.max(...points.map((point) => point.y)) + padding;
	return {
		rect: { left, top, width: right - left, height: bottom - top },
		points,
		label: graphToViewport(graphShape.label),
	};
}

function radialPoint(angle: number, radius: number): { x: number; y: number } {
	return {
		x: Math.cos(angle - Math.PI / 2) * radius,
		y: Math.sin(angle - Math.PI / 2) * radius,
	};
}

function createClosedPathData(points: Array<{ x: number; y: number }>): string {
	const first = points[0];
	return first
		? [
				`M ${first.x} ${first.y}`,
				...points.slice(1).map((point) => `L ${point.x} ${point.y}`),
				'Z',
			].join(' ')
		: '';
}
