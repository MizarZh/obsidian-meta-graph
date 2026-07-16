import Sigma from 'sigma';
import type { ChartGroup } from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import { scaleLayoutGroupPadding } from '../../../layouts/group-geometry';
import {
	fitViewportCircle,
	isViewportPointInGroup,
	normalizeGroupFrameForShape,
	type ResolvedGroupShape,
	type ViewportCircleMember,
	type ViewportGroupRect,
} from '../../../layouts/group-shape';

export interface GroupGeometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GroupInteractionCallbacks {
	onMoveStart?(groupId: string): void;
	onMovePreview?(groupId: string, delta: { x: number; y: number }): void;
	onMoveCommit?(groupId: string, delta: { x: number; y: number }): void;
	onMoveEnd?(groupId: string): void;
	onResizeCommit?(groupId: string, geometry: GroupGeometry): void;
	getGroupNodeIds?(groupId: string): Iterable<string>;
}

export interface GroupOverlayGroup extends ChartGroup {
	shape: ResolvedGroupShape;
	dynamicNodeIds?: string[];
	resizable?: boolean;
}

type GroupResizeDirection =
	| 'left'
	| 'right'
	| 'top'
	| 'bottom'
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right';

interface GroupBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

export class GroupOverlayLayer {
	private readonly layer: HTMLDivElement;
	private readonly activeDocument: Document;
	private groups: GroupOverlayGroup[] = [];
	private callbacks: GroupInteractionCallbacks = {};
	private readonly elements = new Map<string, HTMLDivElement>();
	private readonly updateBound = () => this.update();
	private previousCameraPanning: boolean | undefined;
	private previousCameraZooming: boolean | undefined;
	private holdingInteractionBounds = false;
	private activeDropGroupId: string | undefined;
	private interaction:
		| {
				kind: 'move' | 'resize';
				group: GroupOverlayGroup;
				resizeDirection?: GroupResizeDirection;
				startPointer: { x: number; y: number };
				startGraph: { x: number; y: number };
				lastDelta: { x: number; y: number };
		  }
		| undefined;

	constructor(
		private readonly sigma: Sigma<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes
		>,
		private readonly getGraph: () => RuntimeGraph,
	) {
		const container = sigma.getContainer();
		this.activeDocument = container.ownerDocument;
		this.layer = this.activeDocument.createElement('div');
		this.layer.className = 'knowledge-workspace-group-layer';
		const hoverLayer = container.querySelector('.sigma-hovers');
		if (hoverLayer) {
			container.insertBefore(this.layer, hoverLayer);
		} else {
			container.appendChild(this.layer);
		}
		sigma.on('afterRender', this.updateBound);
	}

	setGroups(
		groups: GroupOverlayGroup[],
		callbacks: GroupInteractionCallbacks = this.callbacks,
	): void {
		this.groups = groups;
		this.callbacks = callbacks;
		const groupIds = new Set(groups.map((group) => group.id));
		for (const [groupId, element] of this.elements.entries()) {
			if (!groupIds.has(groupId)) {
				element.remove();
				this.elements.delete(groupId);
			}
		}
		for (const group of groups) {
			this.getOrCreateGroupElement(group);
		}
		this.update();
	}

	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let bestGroup: { id: string; area: number } | undefined;
		for (const group of this.groups) {
			const rect = this.readGroupViewportRect(group);
			if (!isViewportPointInGroup(position, rect, group.shape)) {
				continue;
			}
			const area = rect.width * rect.height;
			if (!bestGroup || area < bestGroup.area) {
				bestGroup = { id: group.id, area };
			}
		}
		return bestGroup?.id;
	}

	setActiveDropGroup(groupId?: string): void {
		if (this.activeDropGroupId === groupId) {
			return;
		}
		if (this.activeDropGroupId) {
			this.elements
				.get(this.activeDropGroupId)
				?.classList.remove('drop-target');
		}
		this.activeDropGroupId = groupId;
		if (groupId) {
			this.elements.get(groupId)?.classList.add('drop-target');
		}
	}

	update(): void {
		if (this.groups.length === 0) {
			this.layer.hidden = true;
			return;
		}
		this.layer.hidden = false;
		for (const group of this.groups) {
			if (this.interaction?.group.id === group.id) {
				continue;
			}
			const element = this.getOrCreateGroupElement(group);
			const rect = this.readGroupViewportRect(group);
			element.classList.toggle('resizable', group.resizable !== false);
			element.classList.toggle('shape-circle', group.shape === 'circle');
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
			}
		}
	}

	kill(): void {
		this.endInteraction(false);
		this.sigma.off('afterRender', this.updateBound);
		this.layer.remove();
		this.elements.clear();
	}

	private readGroupViewportRect(group: GroupOverlayGroup): ViewportGroupRect {
		if (group.dynamicNodeIds) {
			return this.readDynamicGroupViewportRect(group);
		}
		return this.readStaticGroupViewportRect(group);
	}

	private readStaticGroupViewportRect(
		group: GroupGeometry,
		shape: ResolvedGroupShape = 'rectangle',
	): ViewportGroupRect {
		const normalized = normalizeGroupFrameForShape(group, shape);
		const first = this.sigma.graphToViewport({
			x: normalized.x,
			y: normalized.y,
		});
		const second = this.sigma.graphToViewport({
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
		const sizeScaler = this.sigma as unknown as {
			scaleSize(size?: number): number;
		};
		const nodes: ViewportCircleMember[] | undefined =
			group.dynamicNodeIds?.flatMap((nodeId) => {
				if (!graph.hasNode(nodeId)) {
					return [];
				}
				const attributes = graph.getNodeAttributes(nodeId);
				if (attributes.hidden || attributes.isBend) {
					return [];
				}
				const scaledRadius = sizeScaler.scaleSize(attributes.size);
				return [
					{
						...this.sigma.graphToViewport(attributes),
						radius: Number.isFinite(scaledRadius)
							? Math.max(scaledRadius, 0)
							: Math.max(attributes.size, 0),
					},
				];
			});
		if (!nodes?.length) {
			return { left: 0, top: 0, width: 0, height: 0 };
		}
		const scaledPadding = scaleLayoutGroupPadding(group.padding) * 40;
		const horizontalPadding = 12 + scaledPadding;
		const topPadding = 24 + scaledPadding;
		const bottomPadding = 12 + scaledPadding;
		const minimumWidth = Math.min(220, group.name.length * 6.5 + 20);
		if (group.shape === 'circle') {
			return fitViewportCircle(nodes, 24 + scaledPadding, minimumWidth);
		}
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
		if (right - left < minimumWidth) {
			const extra = (minimumWidth - (right - left)) / 2;
			left -= extra;
			right += extra;
		}
		return { left, top, width: right - left, height: bottom - top };
	}

	private getOrCreateGroupElement(group: GroupOverlayGroup): HTMLDivElement {
		const existing = this.elements.get(group.id);
		if (existing) {
			return existing;
		}
		const element = this.activeDocument.createElement('div');
		element.className = 'knowledge-workspace-group-region';
		const title = this.activeDocument.createElement('span');
		title.className = 'knowledge-workspace-group-title';
		title.textContent = group.name;
		title.addEventListener('pointerdown', (event) =>
			this.startInteraction(event, group.id, 'move'),
		);
		element.appendChild(title);
		for (const direction of [
			'left',
			'right',
			'top',
			'bottom',
			'top-left',
			'top-right',
			'bottom-left',
			'bottom-right',
		] as const) {
			const resizeHandle = this.activeDocument.createElement('button');
			resizeHandle.className = `knowledge-workspace-group-resize resize-${direction}`;
			resizeHandle.type = 'button';
			resizeHandle.setAttribute(
				'aria-label',
				`Resize ${group.name} ${direction}`,
			);
			resizeHandle.addEventListener('pointerdown', (event) =>
				this.startInteraction(event, group.id, 'resize', direction),
			);
			element.appendChild(resizeHandle);
		}
		this.layer.appendChild(element);
		this.elements.set(group.id, element);
		return element;
	}

	private startInteraction(
		event: PointerEvent,
		groupId: string,
		kind: 'move' | 'resize',
		resizeDirection?: GroupResizeDirection,
	): void {
		const group = this.groups.find((item) => item.id === groupId);
		if (!group || (kind === 'resize' && group.resizable === false)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget;
		if (target instanceof HTMLElement) {
			target.setPointerCapture(event.pointerId);
		}
		const startPointer = this.readViewportPoint(event);
		if (kind === 'move') {
			this.callbacks.onMoveStart?.(group.id);
		}
		this.holdInteractionBounds();
		this.interaction = {
			kind,
			group: { ...group },
			resizeDirection,
			startPointer,
			startGraph: this.sigma.viewportToGraph(startPointer),
			lastDelta: { x: 0, y: 0 },
		};
		this.previousCameraPanning = this.sigma.getSetting(
			'enableCameraPanning',
		);
		this.previousCameraZooming = this.sigma.getSetting(
			'enableCameraZooming',
		);
		this.sigma.setSetting('enableCameraPanning', false);
		this.sigma.setSetting('enableCameraZooming', false);
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

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.interaction) {
			return;
		}
		event.preventDefault();
		const geometry = this.readInteractionGeometry(event);
		if (this.interaction.kind === 'move') {
			const totalDelta = {
				x: geometry.x - this.interaction.group.x,
				y: geometry.y - this.interaction.group.y,
			};
			const stepDelta = {
				x: totalDelta.x - this.interaction.lastDelta.x,
				y: totalDelta.y - this.interaction.lastDelta.y,
			};
			this.interaction.lastDelta = totalDelta;
			this.callbacks.onMovePreview?.(
				this.interaction.group.id,
				stepDelta,
			);
			if (this.interaction.group.dynamicNodeIds) {
				this.renderDynamicGroupGeometry(this.interaction.group);
			} else {
				this.renderGroupGeometry(this.interaction.group.id, geometry);
			}
		} else {
			this.renderGroupGeometry(this.interaction.group.id, geometry);
		}
	};

	private readonly handlePointerUp = (event: PointerEvent): void => {
		if (!this.interaction) {
			return;
		}
		event.preventDefault();
		const interaction = this.interaction;
		const geometry = this.readInteractionGeometry(event);
		if (interaction.kind === 'move') {
			const totalDelta = {
				x: geometry.x - interaction.group.x,
				y: geometry.y - interaction.group.y,
			};
			const stepDelta = {
				x: totalDelta.x - interaction.lastDelta.x,
				y: totalDelta.y - interaction.lastDelta.y,
			};
			if (stepDelta.x !== 0 || stepDelta.y !== 0) {
				this.callbacks.onMovePreview?.(interaction.group.id, stepDelta);
			}
			this.callbacks.onMoveCommit?.(interaction.group.id, totalDelta);
		} else {
			this.callbacks.onResizeCommit?.(interaction.group.id, geometry);
		}
		this.endInteraction();
		this.update();
	};

	private endInteraction(notifyMoveEnd = true): void {
		const movedGroupId =
			this.interaction?.kind === 'move'
				? this.interaction.group.id
				: undefined;
		this.interaction = undefined;
		if (this.previousCameraPanning !== undefined) {
			this.sigma.setSetting(
				'enableCameraPanning',
				this.previousCameraPanning,
			);
			this.previousCameraPanning = undefined;
		}
		if (this.previousCameraZooming !== undefined) {
			this.sigma.setSetting(
				'enableCameraZooming',
				this.previousCameraZooming,
			);
			this.previousCameraZooming = undefined;
		}
		this.releaseInteractionBounds();
		this.activeDocument.removeEventListener(
			'pointermove',
			this.handlePointerMove,
		);
		this.activeDocument.removeEventListener(
			'pointerup',
			this.handlePointerUp,
		);
		if (movedGroupId && notifyMoveEnd) {
			this.callbacks.onMoveEnd?.(movedGroupId);
		}
	}

	private holdInteractionBounds(): void {
		if (this.sigma.getCustomBBox()) {
			this.holdingInteractionBounds = false;
			return;
		}
		this.sigma.setCustomBBox(this.sigma.getBBox());
		this.holdingInteractionBounds = true;
	}

	private releaseInteractionBounds(): void {
		if (!this.holdingInteractionBounds) {
			return;
		}
		this.sigma.setCustomBBox(null);
		this.holdingInteractionBounds = false;
	}

	private readInteractionGeometry(event: PointerEvent): GroupGeometry {
		const interaction = this.interaction;
		if (!interaction) {
			return { x: 0, y: 0, width: 0, height: 0 };
		}
		const currentGraph = this.sigma.viewportToGraph(
			this.readViewportPoint(event),
		);
		const delta = {
			x: currentGraph.x - interaction.startGraph.x,
			y: currentGraph.y - interaction.startGraph.y,
		};
		if (interaction.kind === 'move') {
			return {
				x: interaction.group.x + delta.x,
				y: interaction.group.y + delta.y,
				width: interaction.group.width,
				height: interaction.group.height,
			};
		}
		return this.readResizeGeometry(interaction, delta);
	}

	private readResizeGeometry(
		interaction: NonNullable<GroupOverlayLayer['interaction']>,
		delta: { x: number; y: number },
	): GroupGeometry {
		if (interaction.group.shape === 'circle') {
			return this.readCircleResizeGeometry(interaction, delta);
		}
		const minWidth = 0.8;
		const minHeight = 0.6;
		const startLeft = interaction.group.x;
		const startRight = interaction.group.x + interaction.group.width;
		const startBottom = interaction.group.y;
		const startTop = interaction.group.y + interaction.group.height;
		const nodeBounds = this.readGroupNodeBounds(interaction.group.id);
		let left = startLeft;
		let right = startRight;
		let bottom = startBottom;
		let top = startTop;

		if (isLeftResize(interaction.resizeDirection)) {
			left = startLeft + delta.x;
			left = Math.min(left, right - minWidth);
			if (nodeBounds) {
				left = Math.min(left, nodeBounds.left);
			}
		}
		if (isRightResize(interaction.resizeDirection)) {
			right = startRight + delta.x;
			right = Math.max(right, left + minWidth);
			if (nodeBounds) {
				right = Math.max(right, nodeBounds.right);
			}
		}
		if (isTopResize(interaction.resizeDirection)) {
			top = startTop + delta.y;
			top = Math.max(top, bottom + minHeight);
			if (nodeBounds) {
				top = Math.max(top, nodeBounds.top);
			}
		}
		if (isBottomResize(interaction.resizeDirection)) {
			bottom = startBottom + delta.y;
			bottom = Math.min(bottom, top - minHeight);
			if (nodeBounds) {
				bottom = Math.min(bottom, nodeBounds.bottom);
			}
		}

		return {
			x: left,
			y: bottom,
			width: right - left,
			height: top - bottom,
		};
	}

	private readCircleResizeGeometry(
		interaction: NonNullable<GroupOverlayLayer['interaction']>,
		delta: { x: number; y: number },
	): GroupGeometry {
		const group = normalizeGroupFrameForShape(interaction.group, 'circle');
		const direction = interaction.resizeDirection;
		const startDiameter = group.width;
		const diameterDelta = readCircleDiameterDelta(direction, delta);
		let diameter = Math.max(0.8, startDiameter + diameterDelta);
		const nodeBounds = this.readGroupNodeBounds(interaction.group.id);
		for (let attempt = 0; attempt < 6 && nodeBounds; attempt += 1) {
			const geometry = createCircleResizeGeometry(
				group,
				direction,
				diameter,
			);
			const center = {
				x: geometry.x + diameter / 2,
				y: geometry.y + diameter / 2,
			};
			const requiredDiameter = readBoundsCircleDiameter(
				nodeBounds,
				center,
			);
			if (requiredDiameter <= diameter) {
				return geometry;
			}
			diameter = requiredDiameter;
		}
		return createCircleResizeGeometry(group, direction, diameter);
	}

	private readGroupNodeBounds(groupId: string): GroupBounds | undefined {
		const nodeIds = this.callbacks.getGroupNodeIds?.(groupId);
		if (!nodeIds) {
			return undefined;
		}
		const graph = this.getGraph();
		let bounds: GroupBounds | undefined;
		for (const nodeId of nodeIds) {
			if (!graph.hasNode(nodeId)) {
				continue;
			}
			const attributes = graph.getNodeAttributes(nodeId);
			if (attributes.isBend) {
				continue;
			}
			const nodeBounds = this.readNodeBounds(attributes);
			bounds = bounds
				? {
						left: Math.min(bounds.left, nodeBounds.left),
						right: Math.max(bounds.right, nodeBounds.right),
						bottom: Math.min(bounds.bottom, nodeBounds.bottom),
						top: Math.max(bounds.top, nodeBounds.top),
					}
				: nodeBounds;
		}
		return bounds;
	}

	private readNodeBounds(attributes: RuntimeNodeAttributes): GroupBounds {
		const viewportCenter = this.sigma.graphToViewport({
			x: attributes.x,
			y: attributes.y,
		});
		const sizeScaler = this.sigma as unknown as {
			scaleSize(size?: number): number;
		};
		const radius = Math.max(8, sizeScaler.scaleSize(attributes.size) + 4);
		const leftPoint = this.sigma.viewportToGraph({
			x: viewportCenter.x - radius,
			y: viewportCenter.y,
		});
		const rightPoint = this.sigma.viewportToGraph({
			x: viewportCenter.x + radius,
			y: viewportCenter.y,
		});
		const topPoint = this.sigma.viewportToGraph({
			x: viewportCenter.x,
			y: viewportCenter.y - radius,
		});
		const bottomPoint = this.sigma.viewportToGraph({
			x: viewportCenter.x,
			y: viewportCenter.y + radius,
		});
		return {
			left: Math.min(leftPoint.x, rightPoint.x),
			right: Math.max(leftPoint.x, rightPoint.x),
			bottom: Math.min(topPoint.y, bottomPoint.y),
			top: Math.max(topPoint.y, bottomPoint.y),
		};
	}

	private readViewportPoint(event: PointerEvent): { x: number; y: number } {
		const rect = this.sigma.getContainer().getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	private renderGroupGeometry(
		groupId: string,
		geometry: GroupGeometry,
	): void {
		const element = this.elements.get(groupId);
		if (!element) {
			return;
		}
		const group = this.groups.find((item) => item.id === groupId);
		const rect = this.readStaticGroupViewportRect(geometry, group?.shape);
		element.style.left = `${rect.left}px`;
		element.style.top = `${rect.top}px`;
		element.style.width = `${rect.width}px`;
		element.style.height = `${rect.height}px`;
	}

	private renderDynamicGroupGeometry(group: GroupOverlayGroup): void {
		const element = this.elements.get(group.id);
		if (!element) {
			return;
		}
		const rect = this.readDynamicGroupViewportRect(group);
		element.style.left = `${rect.left}px`;
		element.style.top = `${rect.top}px`;
		element.style.width = `${rect.width}px`;
		element.style.height = `${rect.height}px`;
	}
}

function isLeftResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === 'left' ||
		direction === 'top-left' ||
		direction === 'bottom-left'
	);
}

function isRightResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === 'right' ||
		direction === 'top-right' ||
		direction === 'bottom-right'
	);
}

function isTopResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === 'top' ||
		direction === 'top-left' ||
		direction === 'top-right'
	);
}

function isBottomResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === 'bottom' ||
		direction === 'bottom-left' ||
		direction === 'bottom-right'
	);
}

function readCircleDiameterDelta(
	direction: GroupResizeDirection | undefined,
	delta: { x: number; y: number },
): number {
	switch (direction) {
		case 'left':
			return -delta.x;
		case 'right':
			return delta.x;
		case 'top':
			return delta.y;
		case 'bottom':
			return -delta.y;
		case 'top-left':
			return (-delta.x + delta.y) / 2;
		case 'top-right':
			return (delta.x + delta.y) / 2;
		case 'bottom-left':
			return (-delta.x - delta.y) / 2;
		case 'bottom-right':
			return (delta.x - delta.y) / 2;
		default:
			return 0;
	}
}

function createCircleResizeGeometry(
	group: GroupGeometry,
	direction: GroupResizeDirection | undefined,
	diameter: number,
): GroupGeometry {
	const right = group.x + group.width;
	const top = group.y + group.height;
	const centerX = group.x + group.width / 2;
	const centerY = group.y + group.height / 2;
	let x = group.x;
	let y = group.y;
	if (direction === 'left') {
		x = right - diameter;
		y = centerY - diameter / 2;
	} else if (direction === 'right') {
		y = centerY - diameter / 2;
	} else if (direction === 'top') {
		x = centerX - diameter / 2;
	} else if (direction === 'bottom') {
		x = centerX - diameter / 2;
		y = top - diameter;
	} else if (direction === 'top-left') {
		x = right - diameter;
	} else if (direction === 'bottom-left') {
		x = right - diameter;
		y = top - diameter;
	} else if (direction === 'bottom-right') {
		y = top - diameter;
	}
	return { x, y, width: diameter, height: diameter };
}

function readBoundsCircleDiameter(
	bounds: GroupBounds,
	center: { x: number; y: number },
): number {
	return (
		2 *
		Math.max(
			Math.hypot(bounds.left - center.x, bounds.bottom - center.y),
			Math.hypot(bounds.left - center.x, bounds.top - center.y),
			Math.hypot(bounds.right - center.x, bounds.bottom - center.y),
			Math.hypot(bounds.right - center.x, bounds.top - center.y),
		)
	);
}
