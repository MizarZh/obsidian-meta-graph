import Sigma from 'sigma';
import type { ChartGroup } from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';

export interface GroupGeometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GroupInteractionCallbacks {
	onMovePreview?(groupId: string, delta: { x: number; y: number }): void;
	onMoveCommit?(groupId: string, delta: { x: number; y: number }): void;
	onResizeCommit?(groupId: string, geometry: GroupGeometry): void;
	getGroupNodeIds?(groupId: string): Iterable<string>;
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
	private groups: ChartGroup[] = [];
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
				group: ChartGroup;
				resizeDirection?: GroupResizeDirection;
				startPointer: { x: number; y: number };
				startGraph: { x: number; y: number };
				lastDelta: { x: number; y: number };
		  }
		| undefined;

	constructor(
		private readonly sigma: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>,
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
		groups: ChartGroup[],
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

	getGroupAtViewportPosition(position: { x: number; y: number }): string | undefined {
		let bestGroup: { id: string; area: number } | undefined;
		for (const group of this.groups) {
			if (group.mode !== 'manual') {
				continue;
			}
			const rect = this.readGroupViewportRect(group);
			if (
				position.x < rect.left ||
				position.x > rect.left + rect.width ||
				position.y < rect.top ||
				position.y > rect.top + rect.height
			) {
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
			this.elements.get(this.activeDropGroupId)?.classList.remove('drop-target');
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
			element.style.left = `${rect.left}px`;
			element.style.top = `${rect.top}px`;
			element.style.width = `${rect.width}px`;
			element.style.height = `${rect.height}px`;
			element.style.setProperty('--knowledge-workspace-group-color', group.color);
			const title = element.querySelector<HTMLElement>(
				'.knowledge-workspace-group-title',
			);
			if (title) {
				title.textContent = group.name;
			}
		}
	}

	kill(): void {
		this.endInteraction();
		this.sigma.off('afterRender', this.updateBound);
		this.layer.remove();
		this.elements.clear();
	}

	private readGroupViewportRect(group: GroupGeometry): {
		left: number;
		top: number;
		width: number;
		height: number;
	} {
		const first = this.sigma.graphToViewport({
			x: group.x,
			y: group.y,
		});
		const second = this.sigma.graphToViewport({
			x: group.x + group.width,
			y: group.y + group.height,
		});
		return {
			left: Math.min(first.x, second.x),
			top: Math.min(first.y, second.y),
			width: Math.abs(second.x - first.x),
			height: Math.abs(second.y - first.y),
		};
	}

	private getOrCreateGroupElement(group: ChartGroup): HTMLDivElement {
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
		if (!group) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget;
		if (target instanceof HTMLElement) {
			target.setPointerCapture(event.pointerId);
		}
		const startPointer = this.readViewportPoint(event);
		this.holdInteractionBounds();
		this.interaction = {
			kind,
			group: { ...group },
			resizeDirection,
			startPointer,
			startGraph: this.sigma.viewportToGraph(startPointer),
			lastDelta: { x: 0, y: 0 },
		};
		this.previousCameraPanning = this.sigma.getSetting('enableCameraPanning');
		this.previousCameraZooming = this.sigma.getSetting('enableCameraZooming');
		this.sigma.setSetting('enableCameraPanning', false);
		this.sigma.setSetting('enableCameraZooming', false);
		this.activeDocument.addEventListener('pointermove', this.handlePointerMove);
		this.activeDocument.addEventListener('pointerup', this.handlePointerUp, {
			once: true,
		});
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.interaction) {
			return;
		}
		event.preventDefault();
		const geometry = this.readInteractionGeometry(event);
		this.renderGroupGeometry(this.interaction.group.id, geometry);
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
			this.callbacks.onMovePreview?.(this.interaction.group.id, stepDelta);
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
			this.callbacks.onMoveCommit?.(interaction.group.id, {
				x: geometry.x - interaction.group.x,
				y: geometry.y - interaction.group.y,
			});
		} else {
			this.callbacks.onResizeCommit?.(interaction.group.id, geometry);
		}
		this.endInteraction();
	};

	private endInteraction(): void {
		this.interaction = undefined;
		if (this.previousCameraPanning !== undefined) {
			this.sigma.setSetting('enableCameraPanning', this.previousCameraPanning);
			this.previousCameraPanning = undefined;
		}
		if (this.previousCameraZooming !== undefined) {
			this.sigma.setSetting('enableCameraZooming', this.previousCameraZooming);
			this.previousCameraZooming = undefined;
		}
		this.releaseInteractionBounds();
		this.activeDocument.removeEventListener('pointermove', this.handlePointerMove);
		this.activeDocument.removeEventListener('pointerup', this.handlePointerUp);
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
		const currentGraph = this.sigma.viewportToGraph(this.readViewportPoint(event));
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

	private renderGroupGeometry(groupId: string, geometry: GroupGeometry): void {
		const element = this.elements.get(groupId);
		if (!element) {
			return;
		}
		const rect = this.readGroupViewportRect(geometry);
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
	return direction === 'top' || direction === 'top-left' || direction === 'top-right';
}

function isBottomResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === 'bottom' ||
		direction === 'bottom-left' ||
		direction === 'bottom-right'
	);
}
