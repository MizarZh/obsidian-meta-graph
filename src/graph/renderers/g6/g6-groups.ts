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
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const RADIAL_GROUP_LABEL_INSET = 15;
const RADIAL_SECTOR_SAMPLE_ANGLE = Math.PI / 36;
const HALO_CULL_THRESHOLD = 250;
const HALO_DETAIL_LIMIT = 600;
const TRANSFORM_SETTLE_MS = 140;

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
	path?: string;
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

export class G6GroupLayer {
	private readonly layer: SVGSVGElement;
	private readonly scene: SVGGElement;
	private readonly regionsLayer: SVGGElement;
	private readonly halosLayer: SVGGElement;
	private readonly activeDocument: Document;
	private groups: GroupOverlayGroup[] = [];
	private geometries: LayoutGroupGeometry[] = [];
	private callbacks: GroupInteractionCallbacks = {};
	private readonly groupFrames = new Map<string, ViewportGroupRect>();
	private readonly regions: CachedRegion[] = [];
	private readonly halos: CachedHalo[] = [];
	private readonly halosByGroup = new Map<string, CachedHalo[]>();
	private readonly members = new Map<string, Set<string>>();
	private readonly regionElements = new Map<string, SVGElement[]>();
	private geometryDirty = true;
	private renderQueued = false;
	private transformQueued = false;
	private renderFrame?: number;
	private transformFrame?: number;
	private settleTimer?: number;
	private activeDropGroupId?: string;
	private selectedGroupId?: string;
	private hoveredGroupId?: string;
	private focusedNodeId?: string;
	private move?: GroupMove;

	private readonly handleTransform = (): void => {
		this.scheduleTransform();
		const window = this.activeDocument.defaultView;
		if (!window || this.halos.length < HALO_CULL_THRESHOLD) return;
		if (this.settleTimer !== undefined)
			window.clearTimeout(this.settleTimer);
		this.settleTimer = window.setTimeout(() => {
			this.settleTimer = undefined;
			this.renderHalos();
		}, TRANSFORM_SETTLE_MS);
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
	) {
		this.activeDocument = container.ownerDocument;
		this.layer = this.svg('svg');
		this.layer.classList.add(
			'knowledge-workspace-group-layer',
			'knowledge-workspace-g6-group-layer',
		);
		this.layer.setAttribute('aria-hidden', 'true');
		this.scene = this.svg('g');
		this.scene.classList.add('knowledge-workspace-g6-group-scene');
		this.regionsLayer = this.svg('g');
		this.halosLayer = this.svg('g');
		this.scene.append(this.regionsLayer, this.halosLayer);
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
		this.scheduleTransform();
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
		this.updateStates();
	}
	setHoveredGroup(groupId?: string): void {
		if (this.hoveredGroupId === groupId) return;
		this.hoveredGroupId = groupId;
		this.updateStates();
	}
	setFocusedNode(nodeId?: string): void {
		if (this.focusedNodeId === nodeId) return;
		this.focusedNodeId = nodeId;
		this.updateStates();
	}

	update(): void {
		this.renderQueued = false;
		this.layer.style.display =
			this.groups.length === 0 && this.geometries.length === 0
				? 'none'
				: '';
		if (this.geometryDirty) {
			this.rebuildCache();
			this.renderRegions();
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
		if (this.settleTimer !== undefined)
			window?.clearTimeout(this.settleTimer);
		this.viewport.off(GraphEvent.AFTER_TRANSFORM, this.handleTransform);
		this.layer.remove();
		this.groupFrames.clear();
		this.regions.length = 0;
		this.halos.length = 0;
		this.halosByGroup.clear();
		this.members.clear();
		this.regionElements.clear();
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

	private scheduleTransform(): void {
		if (this.transformQueued) return;
		this.transformQueued = true;
		const window = this.activeDocument.defaultView;
		if (window) {
			this.transformFrame = window.requestAnimationFrame(() => {
				this.transformFrame = undefined;
				this.transformQueued = false;
				this.updateTransform();
			});
		} else
			queueMicrotask(() => {
				this.transformQueued = false;
				this.updateTransform();
			});
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
					path: createClosedPathData(shape.points),
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

	private renderRegions(): void {
		this.regionsLayer.replaceChildren();
		this.regionElements.clear();
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
				shape.setAttribute('d', region.path ?? '');
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
			const elements = this.regionElements.get(region.groupId) ?? [];
			elements.push(wrapper);
			this.regionElements.set(region.groupId, elements);
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

	private applyRegionStates(): void {
		for (const [groupId, elements] of this.regionElements)
			for (const element of elements) {
				element.classList.toggle(
					'selected',
					groupId === this.selectedGroupId,
				);
				element.classList.toggle(
					'hovered',
					groupId === this.hoveredGroupId,
				);
				element.classList.toggle(
					'drop-target',
					groupId === this.activeDropGroupId,
				);
				element.classList.toggle(
					'muted-by-focus',
					this.isMuted(groupId),
				);
			}
	}

	private renderHalos(): void {
		const bounds =
			this.halos.length >= HALO_CULL_THRESHOLD
				? this.visibleBounds()
				: undefined;
		const detailed = this.halos.length <= HALO_DETAIL_LIMIT;
		const active = new Set(
			[
				this.selectedGroupId,
				this.hoveredGroupId,
				this.activeDropGroupId,
				this.focusedGroup(),
			].filter((id): id is string => Boolean(id)),
		);
		const candidates = detailed
			? this.halos
			: [...active].flatMap(
					(groupId) => this.halosByGroup.get(groupId) ?? [],
				);
		const batches = new Map<
			string,
			{
				color: string;
				muted: boolean;
				selected: boolean;
				paths: string[];
			}
		>();
		for (const halo of candidates) {
			if (bounds && !circleIntersectsRect(halo, bounds)) continue;
			const muted = this.isMuted(halo.groupId);
			const selected = halo.groupId === this.selectedGroupId;
			const key = `${halo.color}\0${muted}\0${selected}`;
			const batch = batches.get(key) ?? {
				color: halo.color,
				muted,
				selected,
				paths: [],
			};
			batch.paths.push(createCirclePath(halo));
			batches.set(key, batch);
		}
		this.halosLayer.replaceChildren();
		for (const batch of batches.values()) {
			const path = this.svg('path');
			path.classList.add('knowledge-workspace-g6-svg-halos');
			if (batch.muted) path.classList.add('muted-by-focus');
			if (batch.selected) path.classList.add('selected');
			path.style.setProperty(
				'--knowledge-workspace-group-color',
				batch.color,
			);
			path.setAttribute('d', batch.paths.join(' '));
			this.halosLayer.appendChild(path);
		}
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

	private focusedGroup(): string | undefined {
		if (!this.focusedNodeId) return undefined;
		for (const [groupId, members] of this.members)
			if (members.has(this.focusedNodeId)) return groupId;
		return undefined;
	}

	private isMuted(groupId: string): boolean {
		return Boolean(
			this.focusedNodeId &&
			!this.members.get(groupId)?.has(this.focusedNodeId),
		);
	}

	private visibleBounds(): ViewportGroupRect {
		const width = this.container.clientWidth;
		const height = this.container.clientHeight;
		const points = [
			this.viewportToGraph({ x: 0, y: 0 }),
			this.viewportToGraph({ x: width, y: 0 }),
			this.viewportToGraph({ x: 0, y: height }),
			this.viewportToGraph({ x: width, y: height }),
		];
		const left = Math.min(...points.map((point) => point.x));
		const right = Math.max(...points.map((point) => point.x));
		const top = Math.min(...points.map((point) => point.y));
		const bottom = Math.max(...points.map((point) => point.y));
		return { left, top, width: right - left, height: bottom - top };
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

function circleIntersectsRect(
	circle: Pick<CachedHalo, 'x' | 'y' | 'radius'>,
	rect: ViewportGroupRect,
): boolean {
	return (
		circle.x + circle.radius >= rect.left &&
		circle.x - circle.radius <= rect.left + rect.width &&
		circle.y + circle.radius >= rect.top &&
		circle.y - circle.radius <= rect.top + rect.height
	);
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
