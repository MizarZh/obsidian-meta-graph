import type {
	ForceGraph3DInstance,
	LinkObject,
	NodeObject,
} from "3d-force-graph";
import type { LabelPosition } from "../core/types";
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from "./graphology-adapter";
import {
	type GraphEventCallbacks,
	immediateNeighborhood,
} from "./graph-events";
import type { GraphPalette } from "./graph-styles";
import { withAlpha } from "./graph-styles";

interface Force3DNode extends NodeObject {
	id: string;
	label: string;
	color: string;
	size: number;
	path: string;
	isPrimary?: boolean;
	isContext?: boolean;
}

interface Force3DLink extends LinkObject<Force3DNode> {
	id: string;
	source: string | number | Force3DNode;
	target: string | number | Force3DNode;
	color: string;
	size: number;
	label: string;
	directed: boolean;
	hidden: boolean;
}

export class Force3DRenderer {
	readonly instance: ForceGraph3DInstance<Force3DNode, Force3DLink>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private labelColor: string;
	private labelBackgroundOpacity: number;
	private initialized = false;
	private killed = false;
	private pendingFrame: number | undefined;

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
	): Promise<Force3DRenderer> {
		const ForceGraph3D = await loadForceGraph3D();
		const instance = new ForceGraph3D(container, {
			controlType: "trackball",
		}) as unknown as ForceGraph3DInstance<Force3DNode, Force3DLink>;
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
	) {
		this.labelColor = labelColor;
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.instance = instance;
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
			.linkLabel((link) => link.label || "")
			.linkVisibility((link) => !link.hidden)
			.linkColor((link) => this.getLinkColor(link))
			.linkWidth((link) => Math.max(0.4, link.size))
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
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.backgroundColor(palette.background ?? "#202020");
		this.applyTooltipStyles();
		this.refreshWhenReady();
	}

	setSelected(nodeId?: string): void {
		this.selectedNodeId = nodeId;
		this.refreshWhenReady();
	}

	setHovered(nodeId?: string): void {
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.refreshWhenReady();
	}

	setFadeDistance(_fadeDistance: number): void {
		this.refreshWhenReady();
	}

	setLabelSize(_labelSize: number): void {
		this.refreshWhenReady();
	}

	setLabelPosition(_labelPosition: LabelPosition): void {
		this.refreshWhenReady();
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.applyTooltipStyles();
		this.refreshWhenReady();
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.applyTooltipStyles();
		this.refreshWhenReady();
	}

	setLabelDensity(_labelDensity: number): void {
		this.refreshWhenReady();
	}

	setForceLabels(_forceLabels: boolean): void {
		this.refreshWhenReady();
	}

	setEnableForceLayout(enableForceLayout: boolean): void {
		this.instance.enableNodeDrag(enableForceLayout);
	}

	togglePinnedHover(nodeId: string): void {
		this.pinnedNodeId = this.pinnedNodeId === nodeId ? undefined : nodeId;
		this.updateHoveredNeighborhood();
		this.refreshWhenReady();
	}

	clearPinnedHover(): void {
		if (!this.pinnedNodeId) {
			return;
		}
		this.pinnedNodeId = undefined;
		this.updateHoveredNeighborhood();
		this.refreshWhenReady();
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
		let closestNodeId: string | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (const node of this.instance.graphData().nodes) {
			if (!hasFiniteCoordinates(node)) {
				continue;
			}
			const screen = this.instance.graph2ScreenCoords(
				node.x,
				node.y,
				node.z,
			);
			const distance = Math.hypot(screen.x - position.x, screen.y - position.y);
			const hitRadius = Math.max(14, node.size + 8);
			if (distance <= hitRadius && distance < closestDistance) {
				closestDistance = distance;
				closestNodeId = node.id;
			}
		}
		return closestNodeId;
	}

	holdCurrentBounds(): void {
		// 2D Sigma-only behavior.
	}

	clearHeldBounds(): void {
		// 2D Sigma-only behavior.
	}

	kill(): void {
		this.killed = true;
		if (this.pendingFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = undefined;
		}
		this.instance.pauseAnimation();
		this.instance._destructor();
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

export function bindForce3DEvents(
	renderer: Force3DRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const instance = renderer.instance;
	instance
		.onNodeClick((node, event) => {
			if (event.shiftKey) {
				event.preventDefault();
				renderer.togglePinnedHover(node.id);
				return;
			}
			if (event.ctrlKey) {
				event.preventDefault();
				callbacks.onSelect(node.id);
				return;
			}
			callbacks.onSelect(node.id);
			callbacks.onOpen(node.id);
		})
		.onNodeRightClick((node, event) => {
			event.preventDefault();
			callbacks.onSelect(node.id);
		})
		.onNodeHover((node) => {
			callbacks.onHover(node?.id);
		})
		.onBackgroundClick(() => {
			renderer.clearPinnedHover();
			callbacks.onSelect(undefined);
		});
	return () => {
		instance
			.onNodeClick(() => undefined)
			.onNodeRightClick(() => undefined)
			.onNodeHover(() => undefined)
			.onBackgroundClick(() => undefined);
	};
}

function toForce3DData(graph: RuntimeGraph): {
	nodes: Force3DNode[];
	links: Force3DLink[];
} {
	return {
		nodes: graph
			.nodes()
			.filter((nodeId) => !graph.getNodeAttribute(nodeId, "isBend"))
			.map((nodeId) => toForce3DNode(nodeId, graph.getNodeAttributes(nodeId))),
		links: graph
			.edges()
			.map((edgeId) => {
				const attributes = graph.getEdgeAttributes(edgeId);
				return toForce3DLink(
					edgeId,
					graph.source(edgeId),
					graph.target(edgeId),
					attributes,
				);
			}),
	};
}

function toForce3DNode(
	nodeId: string,
	attributes: RuntimeNodeAttributes,
): Force3DNode {
	return {
		id: nodeId,
		label: attributes.label,
		color: attributes.color,
		size: attributes.size,
		path: attributes.path,
		isPrimary: attributes.isPrimary,
		isContext: attributes.isContext,
		x: attributes.x,
		y: attributes.y,
	};
}

function toForce3DLink(
	edgeId: string,
	source: string,
	target: string,
	attributes: RuntimeEdgeAttributes,
): Force3DLink {
	return {
		id: edgeId,
		source: attributes.logicalSource ?? source,
		target: attributes.logicalTarget ?? target,
		color: attributes.color,
		size: attributes.size,
		label: attributes.label || attributes.relation,
		directed: attributes.type.includes("arrow"),
		hidden: attributes.hidden,
	};
}

function getLinkEndpointId(
	endpoint: string | number | Force3DNode | undefined,
): string {
	if (typeof endpoint === "object" && endpoint) {
		return endpoint.id;
	}
	return String(endpoint ?? "");
}

function hasFiniteCoordinates(
	node: Force3DNode,
): node is Force3DNode & { x: number; y: number; z: number } {
	return (
		typeof node.x === "number" &&
		Number.isFinite(node.x) &&
		typeof node.y === "number" &&
		Number.isFinite(node.y) &&
		typeof node.z === "number" &&
		Number.isFinite(node.z)
	);
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
