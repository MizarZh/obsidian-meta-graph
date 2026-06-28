import Sigma from "sigma";
import {
	createEdgeArrowProgram,
	drawStraightEdgeLabel,
	type NodeHoverDrawingFunction,
} from "sigma/rendering";
import type {
	EdgeLabelDrawingFunction,
	NodeLabelDrawingFunction,
} from "sigma/rendering";
import type { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import type { ChartGroup, LabelPosition } from "../core/types";
import {
	type RuntimeEdgeAttributes,
	type RuntimeGraph,
	type RuntimeNodeAttributes,
} from "./graphology-adapter";
import { immediateNeighborhood } from "./graph-events";
import { withAlpha, type GraphPalette } from "./graph-styles";
import { calculateLabelOpacity } from "./label-opacity";
import {
	DashedArrowEdgeProgram,
	DashedEdgeProgram,
	DottedArrowEdgeProgram,
	DottedEdgeProgram,
} from "./patterned-edge-program";

const DEFAULT_NODE_LABEL_BASE_SIZE = 7;

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
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

interface GroupBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

export class SigmaRenderer {
	readonly instance: Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private fadeDistance: number;
	private labelPosition: LabelPosition;
	private labelColor: string;
	private labelBackgroundOpacity: number;
	private forceLabels: boolean;
	private readonly groupOverlayLayer: GroupOverlayLayer;

	constructor(
		private graph: RuntimeGraph,
		container: HTMLElement,
		private readonly palette: GraphPalette,
		fadeDistance = 1.5,
		labelSize = 14,
			labelPosition: LabelPosition = "right",
			labelColor = "",
			labelBackgroundOpacity = 0.82,
			labelDensity = 0.8,
			forceLabels = false,
		) {
		this.fadeDistance = fadeDistance;
		this.labelPosition = labelPosition;
			this.labelColor = labelColor;
			this.labelBackgroundOpacity = labelBackgroundOpacity;
			this.forceLabels = forceLabels;
		this.instance = new Sigma<RuntimeNodeAttributes, RuntimeEdgeAttributes>(
			graph,
			container,
				{
					allowInvalidContainer: true,
					doubleClickZoomingDuration: 0,
					doubleClickZoomingRatio: 1,
					defaultEdgeType: "line",
					edgeProgramClasses: {
					arrow: createEdgeArrowProgram<
						RuntimeNodeAttributes,
						RuntimeEdgeAttributes
					>(),
					dashed: DashedEdgeProgram,
					"dashed-arrow": DashedArrowEdgeProgram,
					dotted: DottedEdgeProgram,
					"dotted-arrow": DottedArrowEdgeProgram,
				},
				nodeReducer: (node, data) => this.reduceNode(node, data),
				edgeReducer: (edge, data) => this.reduceEdge(edge, data),
				defaultDrawNodeLabel: createNodeLabelDrawer(
					palette,
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
				),
				defaultDrawNodeHover: createNodeHoverDrawer(
					palette,
					() => this.getCurrentLabelOpacity(),
					() => this.labelPosition,
					() => this.getLabelColor(),
					() => this.getLabelBackground(),
				),
				defaultDrawEdgeLabel: createEdgeLabelDrawer(() =>
					this.getCurrentLabelOpacity(),
				),
				renderEdgeLabels: true,
					labelColor: { color: palette.label },
					labelSize,
					labelDensity,
					labelRenderedSizeThreshold: 0,
				zIndex: true,
			},
			);
			this.instance
				.getMouseCaptor()
				.on("doubleClick", (event: { preventSigmaDefault(): void }) => {
					event.preventSigmaDefault();
				});
			this.instance
				.getTouchCaptor()
				.on("doubletap", (event: { preventSigmaDefault(): void }) => {
					event.preventSigmaDefault();
				});
			this.groupOverlayLayer = new GroupOverlayLayer(
				this.instance,
				() => this.graph,
			);
		}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		if (this.pinnedNodeId && !graph.hasNode(this.pinnedNodeId)) {
			this.pinnedNodeId = undefined;
		}
		this.updateHoveredNeighborhood();
		this.instance.setGraph(graph);
		this.groupOverlayLayer.update();
	}

	setGroups(groups: ChartGroup[], callbacks?: GroupInteractionCallbacks): void {
		this.groupOverlayLayer.setGroups(groups, callbacks);
	}

	getGroupAtViewportPosition(position: { x: number; y: number }): string | undefined {
		return this.groupOverlayLayer.getGroupAtViewportPosition(position);
	}

	setActiveDropGroup(groupId?: string): void {
		this.groupOverlayLayer.setActiveDropGroup(groupId);
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.instance.refresh();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
	}

	setFadeDistance(fadeDistance: number): void {
		this.fadeDistance = fadeDistance;
		this.instance.refresh();
	}

	setLabelSize(labelSize: number): void {
		this.instance.setSetting("labelSize", labelSize);
	}

	setLabelPosition(labelPosition: LabelPosition): void {
		this.labelPosition = labelPosition;
		this.instance.refresh();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.instance.refresh();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.instance.refresh();
	}

	setLabelDensity(labelDensity: number): void {
		this.instance.setSetting("labelDensity", labelDensity);
	}

	setForceLabels(forceLabels: boolean): void {
		this.forceLabels = forceLabels;
		this.instance.refresh();
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.instance.refresh();
	}

	focusNode(nodeId: string): void {
		const displayData = this.instance.getNodeDisplayData(nodeId);
		if (!displayData) {
			return;
		}
		const camera = this.instance.getCamera();
		void camera.animate(
			{ x: displayData.x, y: displayData.y, ratio: 0.35 },
			{ duration: 350 },
		);
	}

	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		const hitTest = this.instance as unknown as {
			getNodeAtPosition(position: {
				x: number;
				y: number;
			}): string | null;
		};
		const nodeId = hitTest.getNodeAtPosition(position);
		if (!nodeId || !this.graph.hasNode(nodeId)) {
			return this.getNearestNodeAtViewportPosition(position);
		}
		return this.graph.getNodeAttribute(nodeId, "isBend")
			? undefined
			: nodeId;
	}

	private getNearestNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		let closestNodeId: string | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		const sizeScaler = this.instance as unknown as {
			scaleSize(size?: number): number;
		};
		this.graph.forEachNode((nodeId, attributes) => {
			if (attributes.isBend) {
				return;
			}
			const viewportPosition = this.instance.graphToViewport({
				x: attributes.x,
				y: attributes.y,
			});
			const dx = viewportPosition.x - position.x;
			const dy = viewportPosition.y - position.y;
			const distance = Math.hypot(dx, dy);
			const hitRadius = Math.max(
				14,
				sizeScaler.scaleSize(attributes.size) + 8,
			);
			if (distance <= hitRadius && distance < closestDistance) {
				closestNodeId = nodeId;
				closestDistance = distance;
			}
		});
		return closestNodeId;
	}

	fit(): void {
		void this.instance.getCamera().animatedReset({ duration: 350 });
	}

	resize(): void {
		// Sigma's resize() updates canvas dimensions, which clears the drawing
		// buffers. scheduleRefresh() coalesces resize events into one frame and
		// repaints without changing graph coordinates or camera state.
		this.instance.scheduleRefresh({ layoutUnchange: true });
	}

	holdCurrentBounds(): void {
		if (!this.instance.getCustomBBox()) {
			this.instance.setCustomBBox(this.instance.getBBox());
		}
	}

	clearHeldBounds(): void {
		if (this.instance.getCustomBBox()) {
			this.instance.setCustomBBox(null);
		}
	}

	kill(): void {
		this.groupOverlayLayer.kill();
		this.instance.kill();
	}

	private reduceNode(
		node: string,
		data: RuntimeNodeAttributes,
	): Partial<NodeDisplayData> {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (data.isBend) {
			return {
				...data,
				label: null,
				size: 0.01,
				highlighted: false,
				zIndex: -1,
			};
		}
			if (activeHoverNodeId && !this.hoveredNeighborhood.has(node)) {
				return {
					...data,
					color: this.palette.mutedNode,
					label: null,
					forceLabel: false,
					zIndex: 0,
				};
			}
			if (node === this.selectedNodeId) {
				return {
					...data,
					color: this.palette.selected,
					size: data.size + 3,
					highlighted: true,
					forceLabel: true,
					zIndex: 3,
				};
			}
			if (node === activeHoverNodeId) {
				return {
					...data,
					size: data.size + 2,
					highlighted: true,
					forceLabel: true,
					zIndex: 2,
				};
			}
			return { ...data, forceLabel: this.forceLabels, zIndex: 0 };
		}

	private reduceEdge(
		edge: string,
		data: RuntimeEdgeAttributes,
	): Partial<EdgeDisplayData> {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (!activeHoverNodeId) {
			return { ...data };
		}
		const [source, target] = this.graph.extremities(edge);
		const connected =
			source === activeHoverNodeId ||
			target === activeHoverNodeId ||
			data.logicalSource === activeHoverNodeId ||
			data.logicalTarget === activeHoverNodeId;
		return connected
			? { ...data, size: data.size + 1, zIndex: 2 }
			: {
					...data,
					color: this.palette.mutedEdge,
					size: 0.4,
					zIndex: 0,
				};
	}

	private getActiveHoverNodeId(): string | undefined {
		return this.pinnedNodeId ?? this.hoveredNodeId;
	}

	private updateHoveredNeighborhood(): void {
		const nodeId = this.getActiveHoverNodeId();
		this.hoveredNeighborhood =
			nodeId && this.graph.hasNode(nodeId)
				? immediateNeighborhood(this.graph, nodeId)
				: new Set();
	}

	private getCurrentLabelOpacity(): number {
		return calculateLabelOpacity(
			this.fadeDistance,
			this.instance?.getCamera().getState().ratio ?? 1,
		);
	}

	private getLabelBackground(): string {
		return withAlpha(this.palette.labelBackground, this.labelBackgroundOpacity);
	}

	private getLabelColor(): string {
		return this.labelColor || this.palette.label;
	}
}

class GroupOverlayLayer {
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
				kind: "move" | "resize";
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
		this.layer = this.activeDocument.createElement("div");
		this.layer.className = "knowledge-workspace-group-layer";
		const hoverLayer = container.querySelector(".sigma-hovers");
		if (hoverLayer) {
			container.insertBefore(this.layer, hoverLayer);
		} else {
			container.appendChild(this.layer);
		}
		sigma.on("afterRender", this.updateBound);
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
			if (group.mode !== "manual") {
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
			this.elements
				.get(this.activeDropGroupId)
				?.classList.remove("drop-target");
		}
		this.activeDropGroupId = groupId;
		if (groupId) {
			this.elements.get(groupId)?.classList.add("drop-target");
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
			element.style.setProperty(
				"--knowledge-workspace-group-color",
				group.color,
			);
			const title = element.querySelector<HTMLElement>(
				".knowledge-workspace-group-title",
			);
			if (title) {
				title.textContent = group.name;
			}
		}
	}

	kill(): void {
		this.endInteraction();
		this.sigma.off("afterRender", this.updateBound);
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
		const element = this.activeDocument.createElement("div");
		element.className = "knowledge-workspace-group-region";
		const title = this.activeDocument.createElement("span");
		title.className = "knowledge-workspace-group-title";
		title.textContent = group.name;
		title.addEventListener("pointerdown", (event) =>
			this.startInteraction(event, group.id, "move"),
		);
		element.appendChild(title);
		for (const direction of [
			"left",
			"right",
			"top",
			"bottom",
			"top-left",
			"top-right",
			"bottom-left",
			"bottom-right",
		] as const) {
			const resizeHandle = this.activeDocument.createElement("button");
			resizeHandle.className = `knowledge-workspace-group-resize resize-${direction}`;
			resizeHandle.type = "button";
			resizeHandle.setAttribute(
				"aria-label",
				`Resize ${group.name} ${direction}`,
			);
			resizeHandle.addEventListener("pointerdown", (event) =>
				this.startInteraction(event, group.id, "resize", direction),
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
		kind: "move" | "resize",
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
		this.previousCameraPanning = this.sigma.getSetting("enableCameraPanning");
		this.previousCameraZooming = this.sigma.getSetting("enableCameraZooming");
		this.sigma.setSetting("enableCameraPanning", false);
		this.sigma.setSetting("enableCameraZooming", false);
		this.activeDocument.addEventListener("pointermove", this.handlePointerMove);
		this.activeDocument.addEventListener("pointerup", this.handlePointerUp, {
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
		if (this.interaction.kind === "move") {
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
		if (interaction.kind === "move") {
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
			this.sigma.setSetting("enableCameraPanning", this.previousCameraPanning);
			this.previousCameraPanning = undefined;
		}
		if (this.previousCameraZooming !== undefined) {
			this.sigma.setSetting("enableCameraZooming", this.previousCameraZooming);
			this.previousCameraZooming = undefined;
		}
		this.releaseInteractionBounds();
		this.activeDocument.removeEventListener(
			"pointermove",
			this.handlePointerMove,
		);
		this.activeDocument.removeEventListener("pointerup", this.handlePointerUp);
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
		if (interaction.kind === "move") {
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
		interaction: NonNullable<GroupOverlayLayer["interaction"]>,
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
		direction === "left" ||
		direction === "top-left" ||
		direction === "bottom-left"
	);
}

function isRightResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === "right" ||
		direction === "top-right" ||
		direction === "bottom-right"
	);
}

function isTopResize(direction?: GroupResizeDirection): boolean {
	return direction === "top" || direction === "top-left" || direction === "top-right";
}

function isBottomResize(direction?: GroupResizeDirection): boolean {
	return (
		direction === "bottom" ||
		direction === "bottom-left" ||
		direction === "bottom-right"
	);
}

function createNodeLabelDrawer(
	palette: GraphPalette,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (!data.label) {
			return;
		}

		const labelSize = getScaledLabelSize(settings.labelSize, data.size);
		const font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
		const paddingX = 5;
		const paddingY = 3;
		context.save();
		context.font = font;
		context.textBaseline = "middle";
		const textWidth = context.measureText(data.label).width;
		const width = textWidth + paddingX * 2;
		const height = labelSize + paddingY * 2;
			context.globalAlpha = getOpacity();
			drawNodeLabel(
				context,
				data,
				width,
				height,
				paddingX,
				getLabelPosition(),
				getLabelBackground(),
				getLabelColor(),
			);
			context.restore();
		};
	}

function createNodeHoverDrawer(
	palette: GraphPalette,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeHoverDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (data.hidden) return;
		if (typeof data.label !== "string") return;

		const { labelFont: font, labelWeight: weight } = settings;
		const size = getScaledLabelSize(settings.labelSize, data.size);
		context.font = `${weight} ${size}px ${font}`;

		const alpha = getOpacity();
		context.save();
		context.globalAlpha = alpha;
		context.fillStyle = getLabelBackground();
		context.shadowOffsetX = 0;
		context.shadowOffsetY = 0;
		context.shadowBlur = 8;
		context.shadowColor = "rgba(0,0,0,0.4)";

		const paddingX = 5;
		const paddingY = 3;
		const textWidth = context.measureText(data.label).width;
		const width = textWidth + paddingX * 2;
		const height = size + paddingY * 2;
			drawNodeLabel(
				context,
				data,
				width,
				height,
				paddingX,
				getLabelPosition(),
				getLabelBackground(),
				getLabelColor(),
			);

			context.restore();
		};
	}

function drawNodeLabel(
	context: CanvasRenderingContext2D,
	data: Pick<
		NodeDisplayData,
		"x" | "y" | "label" | "size"
	> & { labelRotation?: number; labelDirection?: 1 | -1 },
	width: number,
	height: number,
	paddingX: number,
	labelPosition: LabelPosition,
	labelBackground: string,
	labelColor: string,
): void {
	if (typeof data.label !== "string") {
		return;
	}
	if (typeof data.labelRotation === "number") {
		const gap = 7;
		const direction = data.labelDirection ?? 1;
		const box = getRotatedNodeLabelBox(
			data.size,
			width,
			height,
			paddingX,
			gap,
			direction,
			labelPosition,
		);
		context.save();
		context.translate(data.x, data.y);
		context.rotate(data.labelRotation);
		context.textBaseline = "middle";
		context.textAlign = box.textAlign;
		context.beginPath();
		drawRoundedRect(context, box.x, box.y, width, height, 4);
		context.fillStyle = labelBackground;
		context.fill();
		context.shadowBlur = 0;
		context.fillStyle = labelColor;
		context.fillText(data.label, box.textX, box.textY);
		context.restore();
		return;
	}

	const box = getNodeLabelBox(
		data.x,
		data.y,
		data.size,
		width,
		height,
		paddingX,
		labelPosition,
	);
	context.textBaseline = "middle";
	context.textAlign = box.textAlign;
	context.beginPath();
	drawRoundedRect(context, box.x, box.y, width, height, 4);
	context.fillStyle = labelBackground;
	context.fill();
	context.shadowBlur = 0;
	context.fillStyle = labelColor;
	context.fillText(data.label, box.textX, box.textY);
}

function getRotatedNodeLabelBox(
	nodeSize: number,
	width: number,
	height: number,
	paddingX: number,
	gap: number,
	direction: 1 | -1,
	position: LabelPosition,
): {
	x: number;
	y: number;
	textX: number;
	textY: number;
	textAlign: CanvasTextAlign;
} {
	const outward = direction > 0 ? 1 : -1;
	if (position === "left") {
		const x = outward > 0 ? -nodeSize - gap - width : nodeSize + gap;
		return {
			x,
			y: -height / 2,
			textX: x + (outward > 0 ? width - paddingX : paddingX),
			textY: 0,
			textAlign: outward > 0 ? "right" : "left",
		};
	}
	if (position === "top") {
		return {
			x: -width / 2,
			y: -nodeSize - gap - height,
			textX: 0,
			textY: -nodeSize - gap - height / 2,
			textAlign: "center",
		};
	}
	if (position === "bottom") {
		return {
			x: -width / 2,
			y: nodeSize + gap,
			textX: 0,
			textY: nodeSize + gap + height / 2,
			textAlign: "center",
		};
	}
	const x = outward > 0 ? nodeSize + gap : -nodeSize - gap - width;
	return {
		x,
		y: -height / 2,
		textX: x + (outward > 0 ? paddingX : width - paddingX),
		textY: 0,
		textAlign: outward > 0 ? "left" : "right",
	};
}

function getScaledLabelSize(baseLabelSize: number, nodeSize: number): number {
	return (baseLabelSize * nodeSize) / DEFAULT_NODE_LABEL_BASE_SIZE;
}

function getNodeLabelBox(
	nodeX: number,
	nodeY: number,
	nodeSize: number,
	width: number,
	height: number,
	paddingX: number,
	position: LabelPosition,
): {
	x: number;
	y: number;
	textX: number;
	textY: number;
	textAlign: CanvasTextAlign;
} {
	const gap = 5;
	if (position === "left") {
		const textX = nodeX - nodeSize - gap;
		return {
			x: textX - width + paddingX,
			y: nodeY - height / 2,
			textX,
			textY: nodeY,
			textAlign: "right",
		};
	}
	if (position === "top") {
		const y = nodeY - nodeSize - gap - height;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: "center",
		};
	}
	if (position === "bottom") {
		const y = nodeY + nodeSize + gap;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: "center",
		};
	}
	const textX = nodeX + nodeSize + gap;
	return {
		x: textX - paddingX,
		y: nodeY - height / 2,
		textX,
		textY: nodeY,
		textAlign: "left",
	};
}

function createEdgeLabelDrawer(
	getOpacity: () => number,
): EdgeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, edgeData, sourceData, targetData, settings) => {
		context.save();
		context.globalAlpha = getOpacity();
		drawStraightEdgeLabel(
			context,
			edgeData,
			sourceData,
			targetData,
			settings,
		);
		context.restore();
	};
}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	const right = x + width;
	const bottom = y + height;
	context.moveTo(x + radius, y);
	context.lineTo(right - radius, y);
	context.quadraticCurveTo(right, y, right, y + radius);
	context.lineTo(right, bottom - radius);
	context.quadraticCurveTo(right, bottom, right - radius, bottom);
	context.lineTo(x + radius, bottom);
	context.quadraticCurveTo(x, bottom, x, bottom - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}
