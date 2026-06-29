import type {
	ForceGraph3DInstance,
} from "3d-force-graph";
import type * as Three from "three";
import type { Object3D } from "three";
import type { LabelPosition } from "../../../core/types";
import type { RuntimeGraph } from "../../model/graphology-adapter";
import {
	type Force3DLink,
	type Force3DNode,
	getLinkEndpointId,
	hasFiniteCoordinates,
	toForce3DData,
} from "./force-3d-data";
import { immediateNeighborhood } from "../../model/neighborhood";
import type { GraphPalette } from "../../styles/graph-styles";
import { withAlpha } from "../../styles/graph-styles";
import {
	findClosestScreenNode,
	readViewportPosition,
	type ScreenNode,
} from "../renderer-interaction";
import { createThreeTextSprite } from "../renderer-labels";

interface ThreeRuntime {
	CanvasTexture: typeof Three.CanvasTexture;
	SpriteMaterial: typeof Three.SpriteMaterial;
	Sprite: typeof Three.Sprite;
}

export class Force3DRenderer {
	readonly instance: ForceGraph3DInstance<Force3DNode, Force3DLink>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private labelColor: string;
	private labelBackgroundOpacity: number;
	private labelSize: number;
	private readonly three: ThreeRuntime;
	private initialized = false;
	private killed = false;
	private pendingFrame: number | undefined;
	private pendingConnectionMove: PointerEvent | undefined;
	private pendingConnectionMoveFrame: number | undefined;
	private screenPositionCacheFrame = -1;
	private screenPositionCache: ScreenNode[] = [];
		private readonly blockDoubleClick = (event: MouseEvent): void => {
			event.preventDefault();
			event.stopPropagation();
		};

	static async create(
		graph: RuntimeGraph,
		container: HTMLElement,
		palette: GraphPalette,
		fadeDistance = 1.5,
		labelSize = 14,
		labelPosition: LabelPosition = "right",
		labelColor = "",
		labelBackgroundOpacity = 0.82,
		labelDensity = 0.8,
		enableNodeDrag = false,
		forceLabels = false,
		isStale: () => boolean = () => false,
	): Promise<Force3DRenderer | undefined> {
		const [ForceGraph3D, three] = await Promise.all([
			loadForceGraph3D(),
			loadThree(),
		]);
		if (isStale()) {
			return undefined;
		}
			const instance = new ForceGraph3D(container, {
				controlType: "trackball",
			});
		return new Force3DRenderer(
			instance,
			graph,
			container,
			palette,
			fadeDistance,
			labelSize,
			labelPosition,
			labelColor,
			labelBackgroundOpacity,
			labelDensity,
			enableNodeDrag,
			forceLabels,
			three,
		);
	}

	private constructor(
		instance: ForceGraph3DInstance<Force3DNode, Force3DLink>,
		private graph: RuntimeGraph,
		private readonly container: HTMLElement,
		private palette: GraphPalette,
		_fadeDistance = 1.5,
		_labelSize = 14,
		_labelPosition: LabelPosition = "right",
		labelColor = "",
		labelBackgroundOpacity = 0.82,
		_labelDensity = 0.8,
		enableNodeDrag = false,
		_forceLabels = false,
		three: ThreeRuntime,
	) {
		this.labelColor = labelColor;
		this.labelBackgroundOpacity = labelBackgroundOpacity;
			this.labelSize = _labelSize;
			this.three = three;
			this.instance = instance;
			this.container.addEventListener("dblclick", this.blockDoubleClick, {
				capture: true,
			});
			this.applyTooltipStyles();
		this.instance
			.pauseAnimation()
			.backgroundColor(this.palette.background ?? "#202020")
			.showNavInfo(false)
			.enableNodeDrag(enableNodeDrag)
			.nodeId("id")
			.nodeLabel((node) => this.formatNodeLabel(node))
			.nodeVal((node) => node.size)
			.nodeColor((node) => this.getNodeColor(node))
			.nodeOpacity(0.94)
			.nodeResolution(18)
			.nodeThreeObjectExtend(true)
			.nodeThreeObject((node: Force3DNode) =>
				this.createTextSprite(node.label, this.labelSize, 1),
			)
			.linkLabel((link) => link.label || "")
			.linkVisibility((link) => !link.hidden)
			.linkColor((link) => this.getLinkColor(link))
			.linkWidth((link) => Math.max(0.4, link.size))
			.linkThreeObjectExtend(true)
			.linkThreeObject((link: Force3DLink) =>
				link.label && !link.hidden
					? this.createTextSprite(link.label, Math.max(10, this.labelSize - 2), 0.86)
					: this.createTextSprite("", 1, 0),
			)
			.linkPositionUpdate((object, { start, end }) => {
				object.position.set(
					(start.x + end.x) / 2,
					(start.y + end.y) / 2,
					(start.z + end.z) / 2,
				);
				return true;
			})
			.linkDirectionalArrowLength((link) =>
				link.directed && !link.hidden ? Math.max(2.5, link.size * 2.5) : 0,
			)
			.linkDirectionalArrowRelPos(1)
			.linkDirectionalArrowColor((link) => this.getLinkColor(link))
			.cooldownTicks(120);
		this.resize();
		this.scheduleGraphData(graph);
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
		if (!this.initialized) {
			this.scheduleGraphData(graph);
			return;
		}
		this.instance.graphData(toForce3DData(graph));
		this.refreshWhenReady();
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.backgroundColor(palette.background ?? "#202020");
		this.applyTooltipStyles();
		this.refreshColorsWhenReady();
		this.refreshLabelsWhenReady();
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.refreshColorsWhenReady();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.refreshColorsWhenReady();
	}

	setFadeDistance(_fadeDistance: number): void {
		this.refreshWhenReady();
	}

	setLabelSize(_labelSize: number): void {
		this.labelSize = _labelSize;
		this.refreshLabelsWhenReady();
	}

	setLabelPosition(_labelPosition: LabelPosition): void {
		this.refreshWhenReady();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.applyTooltipStyles();
		this.refreshLabelsWhenReady();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.applyTooltipStyles();
		this.refreshLabelsWhenReady();
	}

	setLabelDensity(_labelDensity: number): void {
		this.refreshLabelsWhenReady();
	}

	setForceLabels(_forceLabels: boolean): void {
		this.refreshLabelsWhenReady();
	}

	setEnableForceLayout(enableForceLayout: boolean): void {
		this.instance.enableNodeDrag(enableForceLayout);
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.refreshColorsWhenReady();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.refreshColorsWhenReady();
	}

	focusNode(nodeId: string): void {
		const node = this.findNode(nodeId);
		if (!node || !hasFiniteCoordinates(node)) {
			this.fit();
			return;
		}
		const distance = Math.max(80, node.size * 18);
		const radius = Math.max(1, Math.hypot(node.x, node.y, node.z));
		const ratio = 1 + distance / radius;
		this.instance.cameraPosition(
			{
				x: node.x * ratio,
				y: node.y * ratio,
				z: node.z * ratio + distance,
			},
			node,
			350,
		);
	}

	resize(): void {
		const { width, height } = this.container.getBoundingClientRect();
		if (width > 0) {
			this.instance.width(width);
		}
		if (height > 0) {
			this.instance.height(height);
		}
	}

	fit(): void {
		this.instance.zoomToFit(350, 80, (node) => !node.id.includes("__bend"));
	}

	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined {
		return findClosestScreenNode(
			this.getScreenPositionCache(),
			position,
			(node) => Math.max(14, node.size + 8),
		);
	}

	getNodeViewportPosition(nodeId: string): { x: number; y: number } | undefined {
		const node = this.findNode(nodeId);
		if (!node || !hasFiniteCoordinates(node)) {
			return undefined;
		}
		const screen = this.instance.graph2ScreenCoords(node.x, node.y, node.z);
		return { x: screen.x, y: screen.y };
	}

	getViewportPosition(event: MouseEvent | PointerEvent): { x: number; y: number } {
		return readViewportPosition(this.container, event);
	}

	scheduleConnectionMove(update: (event: PointerEvent) => void, event: PointerEvent): void {
		this.pendingConnectionMove = event;
		if (this.pendingConnectionMoveFrame !== undefined) {
			return;
		}
		this.pendingConnectionMoveFrame = window.requestAnimationFrame(() => {
			this.pendingConnectionMoveFrame = undefined;
			const pendingEvent = this.pendingConnectionMove;
			if (pendingEvent) {
				update(pendingEvent);
			}
		});
	}

	clearScheduledConnectionMove(): void {
		this.pendingConnectionMove = undefined;
		if (this.pendingConnectionMoveFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingConnectionMoveFrame);
			this.pendingConnectionMoveFrame = undefined;
		}
	}

	private getScreenPositionCache(): ScreenNode[] {
		const frame = Math.floor(performance.now() / 16);
		if (this.screenPositionCacheFrame === frame) {
			return this.screenPositionCache;
		}
		this.screenPositionCacheFrame = frame;
		this.screenPositionCache = this.instance
			.graphData()
			.nodes.flatMap((node) => {
				if (!hasFiniteCoordinates(node)) {
					return [];
				}
				const screen = this.instance.graph2ScreenCoords(
					node.x,
					node.y,
					node.z,
				);
				return [{ id: node.id, x: screen.x, y: screen.y, size: node.size }];
			});
		return this.screenPositionCache;
	}

	holdCurrentBounds(): void {
		// 2D Sigma-only behavior.
	}

	clearHeldBounds(): void {
		// 2D Sigma-only behavior.
	}

		kill(): void {
			this.killed = true;
			this.container.removeEventListener("dblclick", this.blockDoubleClick, {
				capture: true,
			});
			if (this.pendingFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = undefined;
		}
		if (this.pendingConnectionMoveFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingConnectionMoveFrame);
			this.pendingConnectionMoveFrame = undefined;
		}
		this.instance.pauseAnimation();
		this.instance._destructor();
		this.container.replaceChildren();
	}

	private scheduleGraphData(graph: RuntimeGraph): void {
		if (this.pendingFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingFrame);
		}
		this.instance.pauseAnimation();
		this.pendingFrame = window.requestAnimationFrame(() => {
			this.pendingFrame = undefined;
			if (this.killed) {
				return;
			}
			this.instance.graphData(toForce3DData(graph));
			this.initialized = true;
			this.instance.resumeAnimation();
		});
	}

	private refreshWhenReady(): void {
		if (this.initialized && !this.killed) {
			this.instance.refresh();
		}
	}

	private refreshColorsWhenReady(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		this.instance
			.nodeColor((node: Force3DNode) => this.getNodeColor(node))
			.linkColor((link: Force3DLink) => this.getLinkColor(link))
			.linkDirectionalArrowColor((link: Force3DLink) =>
				this.getLinkColor(link),
			);
	}

	private refreshLabelsWhenReady(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		this.instance
			.nodeThreeObject((node: Force3DNode) =>
				this.createTextSprite(node.label, this.labelSize, 1),
			)
			.linkThreeObject((link: Force3DLink) =>
				link.label && !link.hidden
					? this.createTextSprite(
							link.label,
							Math.max(10, this.labelSize - 2),
							0.86,
						)
					: this.createTextSprite("", 1, 0),
			);
	}

	private getActiveHoverNodeId(): string | undefined {
		return this.pinnedNodeId ?? this.hoveredNodeId;
	}

	private updateHoveredNeighborhood(): void {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		this.hoveredNeighborhood = activeHoverNodeId
			? immediateNeighborhood(this.graph, activeHoverNodeId)
			: new Set();
	}

	private findNode(nodeId: string): Force3DNode | undefined {
		return this.instance
			.graphData()
			.nodes.find((node) => node.id === nodeId);
	}

	private getNodeColor(node: Force3DNode): string {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (node.id === this.selectedNodeId) {
			return this.palette.selected;
		}
		if (activeHoverNodeId && !this.hoveredNeighborhood.has(node.id)) {
			return withAlpha(node.color, 0.18);
		}
		return node.color;
	}

	private getLinkColor(link: Force3DLink): string {
		const activeHoverNodeId = this.getActiveHoverNodeId();
		if (
			activeHoverNodeId &&
			(!this.hoveredNeighborhood.has(getLinkEndpointId(link.source)) ||
				!this.hoveredNeighborhood.has(getLinkEndpointId(link.target)))
		) {
			return withAlpha(link.color, 0.12);
		}
		return link.color;
	}

	private formatNodeLabel(node: Force3DNode): string {
		return escapeHtml(node.label);
	}

	private createTextSprite(
		text: string,
		fontSize: number,
		scaleFactor: number,
	): Object3D {
		return createThreeTextSprite(this.three, {
			text,
			fontSize,
			textColor: this.labelColor || this.palette.label,
			backgroundColor:
				this.labelBackgroundOpacity <= 0
					? "transparent"
					: withAlpha(this.palette.labelBackground, this.labelBackgroundOpacity),
			ownerDocument: this.container.ownerDocument,
			scale: scaleFactor,
			scaleMultiplier: 0.24,
			roundRadius: 4,
		});
	}

	private applyTooltipStyles(): void {
		this.container.style.setProperty(
			"--meta-graph-3d-label-color",
			this.labelColor || this.palette.label,
		);
		this.container.style.setProperty(
			"--meta-graph-3d-label-background",
			this.labelBackgroundOpacity <= 0
				? "transparent"
				: withAlpha(
						this.palette.labelBackground,
						this.labelBackgroundOpacity,
					),
		);
	}
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

type ForceGraph3DConstructor = new (
	element: HTMLElement,
	configOptions?: { controlType?: "trackball" | "orbit" | "fly" },
) => ForceGraph3DInstance<Force3DNode, Force3DLink>;

async function loadForceGraph3D(): Promise<ForceGraph3DConstructor> {
	return withSuppressedThreeDuplicateWarning(async () => {
		const module = await import("3d-force-graph");
		return module.default as unknown as ForceGraph3DConstructor;
	});
}

async function loadThree(): Promise<ThreeRuntime> {
	return withSuppressedThreeDuplicateWarning(async () => {
		const module = await import("three");
		return module;
	});
}

async function withSuppressedThreeDuplicateWarning<T>(
	load: () => Promise<T>,
): Promise<T> {
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]) => {
		if (
			typeof args[0] === "string" &&
			args[0].includes("THREE.WARNING: Multiple instances of Three.js")
		) {
			return;
		}
		originalWarn(...args);
	};
	try {
		return await load();
	} finally {
		console.warn = originalWarn;
	}
}
