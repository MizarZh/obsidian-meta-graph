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

const RADIAL_GROUP_LABEL_INSET = 15;
const RADIAL_SECTOR_SAMPLE_ANGLE = Math.PI / 36;

export interface RadialSectorViewportShape {
	rect: ViewportGroupRect;
	points: Array<{ x: number; y: number }>;
	label: { x: number; y: number };
}

interface GroupMove {
	resize?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	group: GroupOverlayGroup;
	startGraph: { x: number; y: number };
	lastDelta: { x: number; y: number };
}

export class G6GroupLayer {
	private readonly layer: HTMLDivElement;
	private readonly activeDocument: Document;
	private groups: GroupOverlayGroup[] = [];
	private geometries: LayoutGroupGeometry[] = [];
	private callbacks: GroupInteractionCallbacks = {};
	private readonly groupElements = new Map<string, HTMLDivElement>();
	private readonly geometryElements = new Map<string, HTMLDivElement>();
	private readonly haloElements = new Map<string, HTMLDivElement>();
	private readonly groupRenderKeys = new Map<string, string>();
	private readonly geometryRenderKeys = new Map<string, string>();
	private readonly haloRenderKeys = new Map<string, string>();
	private updateFrame?: number;
	private updateQueued = false;
	private activeDropGroupId?: string;
	private selectedGroupId?: string;
	private hoveredGroupId?: string;
	private focusedNodeId?: string;
	private move?: GroupMove;
	private readonly updateBound = (): void => this.scheduleUpdate();
	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.move) return;
		event.preventDefault();
		const delta = this.readMoveDelta(event);
		if (this.move.resize) {
			this.scheduleUpdate();
			this.move.lastDelta = delta;
			return;
		}
		const stepDelta = {
			x: delta.x - this.move.lastDelta.x,
			y: delta.y - this.move.lastDelta.y,
		};
		this.move.lastDelta = delta;
		if (stepDelta.x !== 0 || stepDelta.y !== 0) {
			this.callbacks.onMovePreview?.(this.move.group.id, stepDelta);
		}
		this.scheduleUpdate();
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
			this.scheduleUpdate();
			return;
		}
		const stepDelta = {
			x: delta.x - this.move.lastDelta.x,
			y: delta.y - this.move.lastDelta.y,
		};
		if (stepDelta.x !== 0 || stepDelta.y !== 0) {
			this.callbacks.onMovePreview?.(groupId, stepDelta);
		}
		this.callbacks.onMoveCommit?.(groupId, delta);
		this.endMove();
		this.callbacks.onMoveEnd?.(groupId);
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
		this.layer = this.activeDocument.createElement('div');
		this.layer.className = 'knowledge-workspace-group-layer';
		this.container.appendChild(this.layer);
		this.viewport.on(GraphEvent.AFTER_DRAW, this.updateBound);
		this.viewport.on(GraphEvent.AFTER_TRANSFORM, this.updateBound);
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks: GroupInteractionCallbacks = this.callbacks,
	): void {
		this.groups = groups.map((group) => ({ ...group }));
		this.callbacks = callbacks;
		const ids = new Set(groups.map((group) => group.id));
		for (const [id, element] of this.groupElements) {
			if (ids.has(id)) continue;
			element.remove();
			this.groupElements.delete(id);
			this.groupRenderKeys.delete(id);
		}
		for (const group of groups) this.getOrCreateGroupElement(group);
		this.scheduleUpdate();
	}

	setGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.geometries = geometries.map((geometry) => ({ ...geometry }));
		const layoutRegionIds = new Set(
			geometries
				.filter(
					(geometry) =>
						geometry.kind === 'flow-container' ||
						geometry.kind === 'radial-sector',
				)
				.map((geometry) => geometry.groupId),
		);
		for (const [groupId, element] of this.geometryElements) {
			if (layoutRegionIds.has(groupId)) continue;
			element.remove();
			this.geometryElements.delete(groupId);
			this.geometryRenderKeys.delete(groupId);
		}
		if (getGroupNodeIds) {
			this.callbacks = { ...this.callbacks, getGroupNodeIds };
		}
		this.scheduleUpdate();
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let best: { id: string; area: number } | undefined;
		for (const group of this.groups) {
			const rect = this.readGroupViewportRect(
				this.readPreviewGroup(group),
			);
			if (!isViewportPointInGroup(position, rect, group.shape)) continue;
			const area = rect.width * rect.height;
			if (!best || area < best.area) best = { id: group.id, area };
		}
		if (best) return best.id;
		const graphPoint = this.viewportToGraph(position);
		return [...this.geometries]
			.reverse()
			.find((geometry) => isGraphPointInLayoutGroup(geometry, graphPoint))
			?.groupId;
	}

	setActiveDropGroup(groupId?: string): void {
		if (this.activeDropGroupId === groupId) return;
		if (this.activeDropGroupId) {
			this.setRegionClass(this.activeDropGroupId, 'drop-target', false);
		}
		this.activeDropGroupId = groupId;
		if (groupId) {
			this.setRegionClass(groupId, 'drop-target', true);
		}
	}

	setSelectedGroup(groupId?: string): void {
		if (this.selectedGroupId === groupId) return;
		this.selectedGroupId = groupId;
		this.scheduleUpdate();
	}

	setHoveredGroup(groupId?: string): void {
		if (this.hoveredGroupId === groupId) return;
		this.hoveredGroupId = groupId;
		this.scheduleUpdate();
	}

	setFocusedNode(nodeId?: string): void {
		if (this.focusedNodeId === nodeId) return;
		this.focusedNodeId = nodeId;
		this.scheduleUpdate();
	}

	private scheduleUpdate(): void {
		if (this.updateQueued) return;
		this.updateQueued = true;
		const window = this.activeDocument.defaultView;
		if (window) {
			this.updateFrame = window.requestAnimationFrame(() => {
				this.updateFrame = undefined;
				this.updateQueued = false;
				this.update();
			});
			return;
		}
		queueMicrotask(() => {
			this.updateQueued = false;
			this.update();
		});
	}

	update(): void {
		this.layer.hidden =
			this.groups.length === 0 && this.geometries.length === 0;
		for (const group of this.groups) {
			const element = this.getOrCreateGroupElement(group);
			element.classList.toggle('resizable', Boolean(group.resizable));
			const rect = this.readGroupViewportRect(
				this.readPreviewGroup(group),
			);
			for (const handle of Array.from(
				element.querySelectorAll<HTMLElement>(
					'.knowledge-workspace-group-resize',
				),
			)) {
				handle.style.display = group.resizable ? '' : 'none';
			}
			const movable = group.movable !== false;
			const selected = group.id === this.selectedGroupId;
			const hovered = group.id === this.hoveredGroupId;
			const muted = this.isMuted(group.id);
			const renderKey = [
				rect.left,
				rect.top,
				rect.width,
				rect.height,
				group.shape,
				group.color,
				group.name,
				movable,
				selected,
				hovered,
				muted,
			].join('\0');
			if (this.groupRenderKeys.get(group.id) === renderKey) continue;
			this.groupRenderKeys.set(group.id, renderKey);
			element.classList.toggle('movable', movable);
			element.classList.toggle('shape-circle', group.shape === 'circle');
			element.classList.toggle('selected', selected);
			element.classList.toggle('hovered', hovered);
			element.classList.toggle('muted-by-focus', muted);
			element.style.left = `${rect.left}px`;
			element.style.top = `${rect.top}px`;
			element.style.width = `${rect.width}px`;
			element.style.height = `${rect.height}px`;
			element.style.setProperty(
				'--knowledge-workspace-group-color',
				group.color,
			);
			const title = element.querySelector<HTMLElement>(
				'.knowledge-workspace-group-title',
			);
			if (title) {
				title.textContent = group.name;
				title.title = group.name;
			}
		}
		this.updateLayoutRegions();
		this.updateMemberHalos();
	}

	kill(): void {
		this.endMove();
		if (this.updateFrame !== undefined) {
			this.activeDocument.defaultView?.cancelAnimationFrame(
				this.updateFrame,
			);
			this.updateFrame = undefined;
		}
		this.viewport.off(GraphEvent.AFTER_DRAW, this.updateBound);
		this.viewport.off(GraphEvent.AFTER_TRANSFORM, this.updateBound);
		this.layer.remove();
		this.groupElements.clear();
		this.geometryElements.clear();
		this.haloElements.clear();
		this.groupRenderKeys.clear();
		this.geometryRenderKeys.clear();
		this.haloRenderKeys.clear();
	}

	private getOrCreateGroupElement(group: GroupOverlayGroup): HTMLDivElement {
		const existing = this.groupElements.get(group.id);
		if (existing) return existing;
		const element = this.activeDocument.createElement('div');
		element.className = 'knowledge-workspace-group-region';
		const title = this.activeDocument.createElement('span');
		title.className = 'knowledge-workspace-group-title';
		title.textContent = group.name;
		title.title = group.name;
		title.addEventListener('pointerdown', (event) =>
			this.startMove(event, group.id),
		);
		title.addEventListener('contextmenu', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.callbacks.onSelectGroup?.(group.id);
			this.callbacks.onContextMenu?.(group.id, event);
		});
		element.appendChild(title);
		for (const direction of [
			'top-left',
			'top-right',
			'bottom-left',
			'bottom-right',
		] as const) {
			const handle = this.activeDocument.createElement('button');
			handle.type = 'button';
			handle.className = `knowledge-workspace-group-resize resize-${direction}`;
			handle.setAttribute(
				'aria-label',
				`Resize ${group.name} ${direction}`,
			);
			handle.title = `Resize ${group.name}`;
			handle.addEventListener('pointerdown', (event) =>
				this.startMove(event, group.id, direction),
			);
			element.appendChild(handle);
		}
		this.layer.appendChild(element);
		this.groupElements.set(group.id, element);
		return element;
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
			{
				once: true,
			},
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

	private readGroupViewportRect(group: GroupOverlayGroup): ViewportGroupRect {
		return group.dynamicNodeIds
			? this.readDynamicGroupViewportRect(group)
			: this.readStaticGroupViewportRect(group);
	}

	private readStaticGroupViewportRect(
		group: GroupOverlayGroup,
	): ViewportGroupRect {
		const normalized = normalizeGroupFrameForShape(group, group.shape);
		const first = this.graphToViewport({
			x: normalized.x,
			y: normalized.y,
		});
		const second = this.graphToViewport({
			x: normalized.x + normalized.width,
			y: normalized.y + normalized.height,
		});
		return {
			left: Math.min(first.x, second.x),
			top: Math.min(first.y, second.y),
			width: Math.abs(second.x - first.x),
			height: Math.abs(second.y - first.y),
		};
	}

	private readDynamicGroupViewportRect(
		group: GroupOverlayGroup,
	): ViewportGroupRect {
		const graph = this.getGraph();
		const nodes: ViewportCircleMember[] = (
			group.dynamicNodeIds ?? []
		).flatMap((nodeId) => {
			if (!graph.hasNode(nodeId)) return [];
			const attributes = graph.getNodeAttributes(nodeId);
			if (attributes.hidden || attributes.isBend) return [];
			const position = this.getNodePosition(nodeId);
			if (!position) return [];
			return [
				{
					...this.graphToViewport(position),
					radius: Math.max(
						0,
						attributes.size * this.getNodeVisualScale(),
					),
				},
			];
		});
		if (nodes.length === 0) return emptyRect();
		const scaledPadding = scaleLayoutGroupPadding(group.padding) * 40;
		if (group.shape === 'circle') {
			return fitViewportCircle(nodes, 8 + scaledPadding * 0.5);
		}
		const horizontalPadding = 12 + scaledPadding;
		const topPadding = 24 + scaledPadding;
		const bottomPadding = 12 + scaledPadding;
		let left =
			Math.min(...nodes.map((node) => node.x - node.radius)) -
			horizontalPadding;
		let right =
			Math.max(...nodes.map((node) => node.x + node.radius)) +
			horizontalPadding;
		const top =
			Math.min(...nodes.map((node) => node.y - node.radius)) - topPadding;
		const bottom =
			Math.max(...nodes.map((node) => node.y + node.radius)) +
			bottomPadding;
		const minimumWidth = Math.min(220, group.name.length * 6.5 + 20);
		if (right - left < minimumWidth) {
			const extra = (minimumWidth - (right - left)) / 2;
			left -= extra;
			right += extra;
		}
		return { left, top, width: right - left, height: bottom - top };
	}

	private updateMemberHalos(): void {
		const activeKeys = new Set<string>();
		const graph = this.getGraph();
		for (const geometry of this.geometries) {
			for (const nodeId of geometry.nodeIds) {
				if (!graph.hasNode(nodeId)) continue;
				const attributes = graph.getNodeAttributes(nodeId);
				if (attributes.hidden || attributes.isBend) continue;
				const position = this.getNodePosition(nodeId);
				if (!position) continue;
				const key = `${geometry.groupId}\0${nodeId}`;
				activeKeys.add(key);
				const halo = this.getOrCreateHalo(key);
				const center = this.graphToViewport(position);
				const radius = Math.max(
					4,
					attributes.size * this.getNodeVisualScale() + 3,
				);
				const muted = this.isMuted(geometry.groupId);
				const selected = geometry.groupId === this.selectedGroupId;
				const renderKey = [
					center.x,
					center.y,
					radius,
					geometry.color,
					muted,
					selected,
				].join('\0');
				if (this.haloRenderKeys.get(key) === renderKey) continue;
				this.haloRenderKeys.set(key, renderKey);
				halo.style.left = `${center.x - radius}px`;
				halo.style.top = `${center.y - radius}px`;
				halo.style.width = `${radius * 2}px`;
				halo.style.height = `${radius * 2}px`;
				halo.style.setProperty(
					'--knowledge-workspace-group-color',
					geometry.color,
				);
				halo.classList.toggle('muted-by-focus', muted);
				halo.classList.toggle('selected', selected);
			}
		}
		for (const [key, halo] of this.haloElements) {
			if (activeKeys.has(key)) continue;
			halo.remove();
			this.haloElements.delete(key);
			this.haloRenderKeys.delete(key);
		}
	}

	private getOrCreateHalo(key: string): HTMLDivElement {
		const existing = this.haloElements.get(key);
		if (existing) return existing;
		const halo = this.activeDocument.createElement('div');
		halo.className = 'knowledge-workspace-g6-group-halo';
		this.layer.appendChild(halo);
		this.haloElements.set(key, halo);
		return halo;
	}

	private updateLayoutRegions(): void {
		const activeIds = new Set<string>();
		for (const geometry of this.geometries) {
			if (
				geometry.kind !== 'flow-container' &&
				geometry.kind !== 'radial-sector'
			) {
				continue;
			}
			activeIds.add(geometry.groupId);
			if (geometry.kind === 'flow-container') {
				this.updateFlowContainer(geometry);
			} else {
				this.updateRadialSector(geometry);
			}
		}
		for (const [groupId, element] of this.geometryElements) {
			if (activeIds.has(groupId)) continue;
			element.remove();
			this.geometryElements.delete(groupId);
			this.geometryRenderKeys.delete(groupId);
		}
	}

	private updateFlowContainer(geometry: FlowGroupGeometry): void {
		const element = this.getOrCreateGeometryElement(
			geometry.groupId,
			geometry.name,
		);
		const rect = createFlowContainerViewportRect(
			geometry,
			this.graphToViewport,
		);
		const selected = geometry.groupId === this.selectedGroupId;
		const hovered = geometry.groupId === this.hoveredGroupId;
		const muted = this.isMuted(geometry.groupId);
		const dropTarget = geometry.groupId === this.activeDropGroupId;
		const renderKey = [
			geometry.kind,
			rect.left,
			rect.top,
			rect.width,
			rect.height,
			geometry.color,
			geometry.name,
			selected,
			hovered,
			muted,
			dropTarget,
		].join('\0');
		if (this.geometryRenderKeys.get(geometry.groupId) === renderKey) {
			return;
		}
		this.geometryRenderKeys.set(geometry.groupId, renderKey);
		element.classList.remove('knowledge-workspace-g6-radial-sector');
		element
			.querySelector('.knowledge-workspace-g6-radial-sector-shape')
			?.remove();
		element.style.left = `${rect.left}px`;
		element.style.top = `${rect.top}px`;
		element.style.width = `${rect.width}px`;
		element.style.height = `${rect.height}px`;
		element.style.setProperty(
			'--knowledge-workspace-group-color',
			geometry.color,
		);
		element.classList.toggle('selected', selected);
		element.classList.toggle('hovered', hovered);
		element.classList.toggle('muted-by-focus', muted);
		element.classList.toggle('drop-target', dropTarget);
		const title = element.querySelector<HTMLElement>(
			'.knowledge-workspace-group-title',
		);
		if (title) {
			title.textContent = geometry.name;
			title.title = geometry.name;
			title.style.removeProperty('left');
			title.style.removeProperty('top');
		}
	}

	private updateRadialSector(geometry: RadialGroupGeometry): void {
		const element = this.getOrCreateGeometryElement(
			geometry.groupId,
			geometry.name,
		);
		const shape = createRadialSectorViewportShape(
			geometry,
			this.graphToViewport,
		);
		const selected = geometry.groupId === this.selectedGroupId;
		const hovered = geometry.groupId === this.hoveredGroupId;
		const muted = this.isMuted(geometry.groupId);
		const dropTarget = geometry.groupId === this.activeDropGroupId;
		const localPoints = shape.points.map((point) => ({
			x: point.x - shape.rect.left,
			y: point.y - shape.rect.top,
		}));
		const pathData = createClosedPathData(localPoints);
		const renderKey = [
			geometry.kind,
			shape.rect.left,
			shape.rect.top,
			shape.rect.width,
			shape.rect.height,
			pathData,
			shape.label.x,
			shape.label.y,
			geometry.color,
			geometry.name,
			selected,
			hovered,
			muted,
			dropTarget,
		].join('\0');
		if (this.geometryRenderKeys.get(geometry.groupId) === renderKey) return;
		this.geometryRenderKeys.set(geometry.groupId, renderKey);
		element.classList.add('knowledge-workspace-g6-radial-sector');
		element.style.left = `${shape.rect.left}px`;
		element.style.top = `${shape.rect.top}px`;
		element.style.width = `${shape.rect.width}px`;
		element.style.height = `${shape.rect.height}px`;
		element.style.setProperty(
			'--knowledge-workspace-group-color',
			geometry.color,
		);
		element.classList.toggle('selected', selected);
		element.classList.toggle('hovered', hovered);
		element.classList.toggle('muted-by-focus', muted);
		element.classList.toggle('drop-target', dropTarget);
		const { svg, path } = this.getOrCreateRadialSectorShape(element);
		svg.setAttribute(
			'viewBox',
			`0 0 ${shape.rect.width} ${shape.rect.height}`,
		);
		path.setAttribute('d', pathData);
		const title = element.querySelector<HTMLElement>(
			'.knowledge-workspace-group-title',
		);
		if (title) {
			title.textContent = geometry.name;
			title.title = geometry.name;
			title.style.left = `${shape.label.x - shape.rect.left}px`;
			title.style.top = `${shape.label.y - shape.rect.top}px`;
		}
	}

	private getOrCreateRadialSectorShape(element: HTMLDivElement): {
		svg: SVGSVGElement;
		path: SVGPathElement;
	} {
		const existing = element.querySelector<SVGSVGElement>(
			'.knowledge-workspace-g6-radial-sector-shape',
		);
		const existingPath = existing?.querySelector<SVGPathElement>('path');
		if (existing && existingPath) {
			return { svg: existing, path: existingPath };
		}
		const namespace = 'http://www.w3.org/2000/svg';
		const svg = this.activeDocument.createElementNS(namespace, 'svg');
		svg.classList.add('knowledge-workspace-g6-radial-sector-shape');
		svg.setAttribute('aria-hidden', 'true');
		const path = this.activeDocument.createElementNS(namespace, 'path');
		path.classList.add('knowledge-workspace-g6-radial-sector-path');
		svg.appendChild(path);
		element.prepend(svg);
		return { svg, path };
	}

	private getOrCreateGeometryElement(
		groupId: string,
		name: string,
	): HTMLDivElement {
		const existing = this.geometryElements.get(groupId);
		if (existing) return existing;
		const element = this.activeDocument.createElement('div');
		element.className =
			'knowledge-workspace-group-region knowledge-workspace-g6-layout-group-region';
		const title = this.activeDocument.createElement('span');
		title.className = 'knowledge-workspace-group-title';
		title.textContent = name;
		title.title = name;
		element.appendChild(title);
		this.layer.prepend(element);
		this.geometryElements.set(groupId, element);
		return element;
	}

	private setRegionClass(
		groupId: string,
		className: string,
		enabled: boolean,
	): void {
		this.groupElements.get(groupId)?.classList.toggle(className, enabled);
		this.geometryElements
			.get(groupId)
			?.classList.toggle(className, enabled);
	}

	private isMuted(groupId: string): boolean {
		if (!this.focusedNodeId || !this.callbacks.getGroupNodeIds)
			return false;
		for (const nodeId of this.callbacks.getGroupNodeIds(groupId)) {
			if (nodeId === this.focusedNodeId) return false;
		}
		return true;
	}
}

function emptyRect(): ViewportGroupRect {
	return { left: 0, top: 0, width: 0, height: 0 };
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

export function createRadialSectorViewportShape(
	geometry: RadialGroupGeometry,
	graphToViewport: (position: { x: number; y: number }) => {
		x: number;
		y: number;
	},
): RadialSectorViewportShape {
	const span = Math.max(0.001, geometry.endAngle - geometry.startAngle);
	const samples = Math.max(8, Math.ceil(span / RADIAL_SECTOR_SAMPLE_ANGLE));
	const angles = Array.from(
		{ length: samples + 1 },
		(_, index) => geometry.startAngle + (span * index) / samples,
	);
	const outer = angles.map((angle) =>
		graphToViewport(radialPoint(angle, geometry.outerRadius)),
	);
	const inner = [...angles]
		.reverse()
		.map((angle) =>
			graphToViewport(radialPoint(angle, geometry.innerRadius)),
		);
	const points = [...outer, ...inner];
	const padding = 2;
	const left = Math.min(...points.map((point) => point.x)) - padding;
	const right = Math.max(...points.map((point) => point.x)) + padding;
	const top = Math.min(...points.map((point) => point.y)) - padding;
	const bottom = Math.max(...points.map((point) => point.y)) + padding;
	const middleAngle = (geometry.startAngle + geometry.endAngle) / 2;
	const labelRadius = Math.max(
		geometry.innerRadius,
		geometry.outerRadius - RADIAL_GROUP_LABEL_INSET,
	);
	return {
		rect: { left, top, width: right - left, height: bottom - top },
		points,
		label: graphToViewport(radialPoint(middleAngle, labelRadius)),
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
	if (!first) return '';
	return [
		`M ${first.x} ${first.y}`,
		...points.slice(1).map((point) => `L ${point.x} ${point.y}`),
		'Z',
	].join(' ');
}
