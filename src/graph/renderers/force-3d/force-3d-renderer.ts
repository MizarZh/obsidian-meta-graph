import type { ForceGraph3DInstance } from '3d-force-graph';
import type * as Three from 'three';
import type { Object3D } from 'three';
import type { LabelPosition } from '../../../core/types';
import type { RuntimeGraph } from '../../model/graphology-adapter';
import {
	type Force3DLink,
	type Force3DNode,
	getLinkEndpointId,
	hasFiniteCoordinates,
	syncForce3DDataStyles,
	toForce3DData,
} from './force-3d-data';
import { immediateNeighborhood } from '../../model/neighborhood';
import type { GraphPalette } from '../../styles/graph-styles';
import { withAlpha } from '../../styles/graph-styles';
import {
	resolveThreeLabelStyle,
	type LabelThemeConfig,
} from '../renderer-label-style';
import {
	findClosestScreenNode,
	readViewportPosition,
	type ScreenNode,
} from '../renderer-interaction';
import { createThreeTextSprite } from '../renderer-labels';

interface ThreeRuntime {
	CanvasTexture: typeof Three.CanvasTexture;
	Color: typeof Three.Color;
	SpriteMaterial: typeof Three.SpriteMaterial;
	Sprite: typeof Three.Sprite;
}

interface ScheduledVisualUpdate {
	refreshAccessors?: boolean;
	allLabelSprites?: boolean;
	nodeLabelIds?: ReadonlySet<string>;
	linkLabelIds?: ReadonlySet<string>;
	nodeLabelPositions?: boolean;
}

export class Force3DRenderer {
	readonly instance: ForceGraph3DInstance<Force3DNode, Force3DLink>;
	private selectedNodeId?: string;
	private hoveredNodeId?: string;
	private pinnedNodeId?: string;
	private hoveredNeighborhood = new Set<string>();
	private labelColor: string;
	private labelPosition: LabelPosition;
	private labelOffset: number;
	private labelTheme: LabelThemeConfig;
	private labelBackgroundOpacity: number;
	private labelSize: number;
	private readonly three: ThreeRuntime;
	private initialized = false;
	private killed = false;
	private pendingFrame: number | undefined;
	private pendingConnectionMove: PointerEvent | undefined;
	private pendingConnectionMoveFrame: number | undefined;
	private pendingVisualFrame: number | undefined;
	private pendingRefreshAccessors = false;
	private pendingAllLabelSprites = false;
	private pendingNodeLabelPositions = false;
	private pendingNodeLabelIds = new Set<string>();
	private pendingLinkLabelIds = new Set<string>();
	private screenPositionCacheFrame = -1;
	private screenPositionCache: ScreenNode[] = [];
	private readonly forceNodeCache = new Map<string, Force3DNode>();
	private readonly forceLinkCache = new Map<string, Force3DLink>();
	private readonly nodeLabelSprites = new Map<string, Three.Sprite>();
	private readonly linkLabelSprites = new Map<string, Three.Sprite>();
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
		labelPosition: LabelPosition = 'right',
		labelColor = '',
		labelBackgroundOpacity = 0.82,
		labelDensity = 0.8,
		enableNodeDrag = false,
		forceLabels = false,
		isStale: () => boolean = () => false,
		labelOffset = 1,
		labelLightTextColor = '#111111',
		labelLightBackgroundColor = '#ffffff',
		labelLightBackgroundOpacity = 0.82,
		labelDarkTextColor = '#ffffff',
		labelDarkBackgroundColor = '#000000',
		labelDarkBackgroundOpacity = 0.62,
	): Promise<Force3DRenderer | undefined> {
		const [ForceGraph3D, three] = await Promise.all([
			loadForceGraph3D(),
			loadThree(),
		]);
		if (isStale()) {
			return undefined;
		}
		const instance = new ForceGraph3D(container, {
			controlType: 'trackball',
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
			labelOffset,
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		);
	}

	private constructor(
		instance: ForceGraph3DInstance<Force3DNode, Force3DLink>,
		private graph: RuntimeGraph,
		private readonly container: HTMLElement,
		private palette: GraphPalette,
		_fadeDistance = 1.5,
		_labelSize = 14,
		_labelPosition: LabelPosition = 'right',
		labelColor = '',
		labelBackgroundOpacity = 0.82,
		_labelDensity = 0.8,
		enableNodeDrag = false,
		_forceLabels = false,
		three: ThreeRuntime,
		labelOffset = 1,
		labelLightTextColor = '#111111',
		labelLightBackgroundColor = '#ffffff',
		labelLightBackgroundOpacity = 0.82,
		labelDarkTextColor = '#ffffff',
		labelDarkBackgroundColor = '#000000',
		labelDarkBackgroundOpacity = 0.62,
	) {
		this.labelColor = labelColor;
		this.labelPosition = _labelPosition;
		this.labelOffset = labelOffset;
		this.labelTheme = {
			labelLightTextColor,
			labelLightBackgroundColor,
			labelLightBackgroundOpacity,
			labelDarkTextColor,
			labelDarkBackgroundColor,
			labelDarkBackgroundOpacity,
		};
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.labelSize = _labelSize;
		this.three = three;
		this.instance = instance;
		this.container.addEventListener('dblclick', this.blockDoubleClick, {
			capture: true,
		});
		this.applyTooltipStyles();
		this.instance
			.pauseAnimation()
			.backgroundColor(this.palette.background ?? '#202020')
			.showNavInfo(false)
			.enableNodeDrag(enableNodeDrag)
			.nodeId('id')
			.nodeLabel((node) => this.formatNodeLabel(node))
			.nodeVal((node) => node.size)
			.nodeColor((node) => this.getNodeColor(node))
			.nodeOpacity(0.94)
			.nodeResolution(18)
			.nodeThreeObjectExtend(true)
			.nodeThreeObject((node: Force3DNode) => {
				const sprite = this.createTextSprite(
					node.label,
					this.labelSize,
					1,
				);
				this.nodeLabelSprites.set(node.id, sprite);
				return sprite;
			})
			.nodePositionUpdate((object: Object3D, coordinates, node) => {
				this.positionNodeLabel(object, coordinates, node);
				return true;
			})
			.linkLabel((link) => link.label || '')
			.linkColor((link) => this.getLinkColor(link))
			.linkWidth((link) => Math.max(0.4, link.size))
			.linkThreeObjectExtend(true)
			.linkThreeObject((link: Force3DLink) => {
				const sprite = this.shouldShowLinkLabel(link)
					? this.createTextSprite(
							link.label,
							Math.max(10, this.labelSize - 2),
							0.86,
						)
					: this.createTextSprite('', 1, 0);
				this.linkLabelSprites.set(link.id, sprite);
				return sprite;
			})
			.linkPositionUpdate((object, { start, end }) => {
				object.position.set(
					(start.x + end.x) / 2,
					(start.y + end.y) / 2,
					(start.z + end.z) / 2,
				);
				return true;
			})
			.linkDirectionalArrowLength((link) =>
				link.directed ? Math.max(2.5, link.size * 2.5) : 0,
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
		this.nodeLabelSprites.clear();
		this.linkLabelSprites.clear();
		this.snapshotForceData();
		this.instance.graphData(
			toForce3DData(graph, this.forceNodeCache, this.forceLinkCache),
		);
		this.refreshWhenReady();
	}

	refreshGraphStyles(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		const result = syncForce3DDataStyles(
			this.graph,
			this.instance.graphData(),
		);
		const topologyChanged =
			result.nodeVisibilityChanged || result.linkVisibilityChanged;
		if (topologyChanged) {
			this.applyVisibleGraphData();
		}
		this.scheduleVisualUpdate({
			refreshAccessors:
				!topologyChanged &&
				(result.nodeStyleChanged || result.linkStyleChanged),
			nodeLabelIds: result.nodeLabelIds,
			linkLabelIds: result.linkLabelIds,
			nodeLabelPositions:
				result.nodeStyleChanged || result.nodeVisibilityChanged,
		});
	}

	setPalette(palette: GraphPalette): void {
		this.palette = palette;
		this.instance.scene().background = new this.three.Color(
			palette.background ?? '#202020',
		);
		this.applyTooltipStyles();
		this.refreshColorsWhenReady();
		this.scheduleVisualUpdate({ allLabelSprites: true });
	}

	setSelected(nodeId?: string): void {
		if (this.selectedNodeId === nodeId) {
			return;
		}
		this.selectedNodeId = nodeId;
		this.refreshColorsWhenReady();
	}

	setHovered(nodeId?: string): void {
		if (this.hoveredNodeId === nodeId) {
			return;
		}
		this.hoveredNodeId = nodeId;
		this.updateHoveredNeighborhood();
		this.refreshColorsWhenReady();
	}

	setFadeDistance(_fadeDistance: number): void {
		// 3D labels do not use Sigma camera fade distance.
	}

	setLabelSize(_labelSize: number): void {
		this.labelSize = _labelSize;
		this.scheduleVisualUpdate({
			allLabelSprites: true,
			nodeLabelPositions: true,
		});
	}

	setLabelPosition(_labelPosition: LabelPosition): void {
		this.labelPosition = _labelPosition;
		this.scheduleVisualUpdate({ nodeLabelPositions: true });
	}

	setLabelOffset(labelOffset: number): void {
		this.labelOffset = labelOffset;
		this.scheduleVisualUpdate({ nodeLabelPositions: true });
	}

	setLabelColor(labelColor: string): void {
		this.labelColor = labelColor;
		this.applyTooltipStyles();
		this.scheduleVisualUpdate({ allLabelSprites: true });
	}

	setLabelTheme(labelTheme: LabelThemeConfig): void {
		this.labelTheme = labelTheme;
		this.applyTooltipStyles();
		this.scheduleVisualUpdate({ allLabelSprites: true });
	}

	setLabelBackgroundOpacity(labelBackgroundOpacity: number): void {
		this.labelBackgroundOpacity = labelBackgroundOpacity;
		this.applyTooltipStyles();
		this.scheduleVisualUpdate({ allLabelSprites: true });
	}

	setLabelDensity(_labelDensity: number): void {
		// 3D labels are scene objects, not density-filtered canvas labels.
	}

	setForceLabels(_forceLabels: boolean): void {
		// 3D graph renders node labels as sprites for every visible node.
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
		this.instance.zoomToFit(350, 80, (node) => !node.id.includes('__bend'));
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

	getNodeViewportPosition(
		nodeId: string,
	): { x: number; y: number } | undefined {
		const node = this.findNode(nodeId);
		if (!node || !hasFiniteCoordinates(node)) {
			return undefined;
		}
		const screen = this.instance.graph2ScreenCoords(node.x, node.y, node.z);
		return { x: screen.x, y: screen.y };
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const camera = this.instance.cameraPosition();
		const distance = Math.max(
			1,
			Math.hypot(camera.x ?? 0, camera.y ?? 0, camera.z ?? 0),
		);
		const graphPosition = this.instance.screen2GraphCoords(
			position.x,
			position.y,
			distance,
		);
		return { x: graphPosition.x, y: graphPosition.y };
	}

	getViewportPosition(event: MouseEvent | PointerEvent): {
		x: number;
		y: number;
	} {
		return readViewportPosition(this.container, event);
	}

	scheduleConnectionMove(
		update: (event: PointerEvent) => void,
		event: PointerEvent,
	): void {
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
				if (node.hidden || !hasFiniteCoordinates(node)) {
					return [];
				}
				const screen = this.instance.graph2ScreenCoords(
					node.x,
					node.y,
					node.z,
				);
				return [
					{ id: node.id, x: screen.x, y: screen.y, size: node.size },
				];
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
		this.container.removeEventListener('dblclick', this.blockDoubleClick, {
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
		if (this.pendingVisualFrame !== undefined) {
			window.cancelAnimationFrame(this.pendingVisualFrame);
			this.pendingVisualFrame = undefined;
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
			this.nodeLabelSprites.clear();
			this.linkLabelSprites.clear();
			this.snapshotForceData();
			this.instance.graphData(
				toForce3DData(graph, this.forceNodeCache, this.forceLinkCache),
			);
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

	private refreshVisualAccessorsWhenReady(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		this.instance
			.nodeVal((node: Force3DNode) => node.size)
			.nodeColor((node: Force3DNode) => this.getNodeColor(node))
			.linkColor((link: Force3DLink) => this.getLinkColor(link))
			.linkWidth((link: Force3DLink) => Math.max(0.4, link.size))
			.linkDirectionalArrowLength((link: Force3DLink) =>
				link.directed ? Math.max(2.5, link.size * 2.5) : 0,
			)
			.linkDirectionalArrowColor((link: Force3DLink) =>
				this.getLinkColor(link),
			);
	}

	private updateLabelSprites({
		all = true,
		nodeIds,
		linkIds,
	}: {
		all?: boolean;
		nodeIds?: ReadonlySet<string>;
		linkIds?: ReadonlySet<string>;
	} = {}): void {
		if (!this.initialized || this.killed) {
			return;
		}
		for (const node of this.instance.graphData().nodes) {
			if (!all && !nodeIds?.has(node.id)) {
				continue;
			}
			const sprite = this.nodeLabelSprites.get(node.id);
			if (!sprite) {
				continue;
			}
			const next = this.createTextSprite(node.label, this.labelSize, 1);
			this.replaceSpriteTexture(sprite, next);
		}
		for (const link of this.instance.graphData().links) {
			if (!all && !linkIds?.has(link.id)) {
				continue;
			}
			const sprite = this.linkLabelSprites.get(link.id);
			if (!sprite) {
				continue;
			}
			const next = this.shouldShowLinkLabel(link)
				? this.createTextSprite(
						link.label,
						Math.max(10, this.labelSize - 2),
						0.86,
					)
				: this.createTextSprite('', 1, 0);
			this.replaceSpriteTexture(sprite, next);
		}
	}

	private scheduleVisualUpdate(update: ScheduledVisualUpdate): void {
		this.pendingRefreshAccessors ||= Boolean(update.refreshAccessors);
		this.pendingAllLabelSprites ||= Boolean(update.allLabelSprites);
		this.pendingNodeLabelPositions ||= Boolean(update.nodeLabelPositions);
		if (!this.pendingAllLabelSprites) {
			update.nodeLabelIds?.forEach((nodeId) =>
				this.pendingNodeLabelIds.add(nodeId),
			);
			update.linkLabelIds?.forEach((linkId) =>
				this.pendingLinkLabelIds.add(linkId),
			);
		}
		if (this.pendingVisualFrame !== undefined) {
			return;
		}
		this.pendingVisualFrame = window.requestAnimationFrame(() => {
			this.pendingVisualFrame = undefined;
			this.flushVisualUpdate();
		});
	}

	private flushVisualUpdate(): void {
		if (!this.initialized || this.killed) {
			this.clearPendingVisualUpdate();
			return;
		}
		const refreshAccessors = this.pendingRefreshAccessors;
		const allLabelSprites = this.pendingAllLabelSprites;
		const nodeLabelPositions = this.pendingNodeLabelPositions;
		const nodeLabelIds = new Set(this.pendingNodeLabelIds);
		const linkLabelIds = new Set(this.pendingLinkLabelIds);
		this.clearPendingVisualUpdate();

		if (refreshAccessors) {
			this.refreshVisualAccessorsWhenReady();
		}
		if (allLabelSprites || nodeLabelIds.size > 0 || linkLabelIds.size > 0) {
			this.updateLabelSprites({
				all: allLabelSprites,
				nodeIds: nodeLabelIds,
				linkIds: linkLabelIds,
			});
		}
		if (nodeLabelPositions) {
			this.updateNodeLabelPositions();
		}
		this.renderFrame();
	}

	private clearPendingVisualUpdate(): void {
		this.pendingRefreshAccessors = false;
		this.pendingAllLabelSprites = false;
		this.pendingNodeLabelPositions = false;
		this.pendingNodeLabelIds.clear();
		this.pendingLinkLabelIds.clear();
	}

	private replaceSpriteTexture(
		target: Three.Sprite,
		source: Three.Sprite,
	): void {
		const targetMaterial = target.material;
		target.material = source.material;
		target.scale.copy(source.scale);
		targetMaterial.map?.dispose();
		targetMaterial.dispose();
	}

	private updateNodeLabelPositions(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		for (const node of this.instance.graphData().nodes) {
			const sprite = this.nodeLabelSprites.get(node.id);
			if (!sprite || node.hidden || !hasFiniteCoordinates(node)) {
				continue;
			}
			this.positionNodeLabel(sprite, node, node);
		}
	}

	private applyVisibleGraphData(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		this.snapshotForceData();
		this.nodeLabelSprites.clear();
		this.linkLabelSprites.clear();
		this.instance.graphData(
			toForce3DData(this.graph, this.forceNodeCache, this.forceLinkCache),
		);
		this.refreshWhenReady();
	}

	private snapshotForceData(): void {
		for (const node of this.instance.graphData().nodes) {
			this.forceNodeCache.set(node.id, node);
		}
		for (const link of this.instance.graphData().links) {
			this.forceLinkCache.set(link.id, link);
		}
	}

	private renderFrame(): void {
		if (!this.initialized || this.killed) {
			return;
		}
		this.instance
			.renderer()
			.render(this.instance.scene(), this.instance.camera());
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
			.nodes.find((node) => node.id === nodeId && !node.hidden);
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
	): Three.Sprite {
		const labelStyle = resolveThreeLabelStyle(
			this.palette,
			this.labelTheme,
		);
		return createThreeTextSprite(this.three, {
			text,
			fontSize,
			textColor: labelStyle.textColor,
			backgroundColor: labelStyle.backgroundColor,
			ownerDocument: this.container.ownerDocument,
			scale: scaleFactor,
			scaleMultiplier: 0.24,
			roundRadius: 4,
		});
	}

	private positionNodeLabel(
		object: Object3D,
		coordinates: { x: number; y: number; z: number },
		node: Force3DNode,
	): void {
		const offset = Math.max(
			4,
			node.size + this.labelSize * this.labelOffset,
		);
		const direction = this.readLabelDirection(coordinates);
		object.position.set(
			direction.x * offset,
			direction.y * offset,
			direction.z * offset,
		);
	}

	private readLabelDirection(coordinates: {
		x: number;
		y: number;
		z: number;
	}): { x: number; y: number; z: number } {
		const position =
			this.labelPosition === 'auto' ? 'right' : this.labelPosition;
		if (position === 'center') {
			return { x: 0, y: 0, z: 0 };
		}
		if (position === 'left') return { x: -1, y: 0, z: 0 };
		if (position === 'right') return { x: 1, y: 0, z: 0 };
		if (position === 'top') return { x: 0, y: 1, z: 0 };
		if (position === 'bottom') return { x: 0, y: -1, z: 0 };
		const length =
			Math.hypot(coordinates.x, coordinates.y, coordinates.z) || 1;
		return {
			x: coordinates.x / length,
			y: coordinates.y / length,
			z: coordinates.z / length,
		};
	}

	private shouldShowLinkLabel(link: Force3DLink): boolean {
		return Boolean(link.label) && link.forceLabel && !link.hidden;
	}

	private applyTooltipStyles(): void {
		const labelStyle = resolveThreeLabelStyle(
			this.palette,
			this.labelTheme,
		);
		this.container.style.setProperty(
			'--meta-graph-3d-label-color',
			labelStyle.textColor,
		);
		this.container.style.setProperty(
			'--meta-graph-3d-label-background',
			labelStyle.backgroundColor,
		);
	}
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

type ForceGraph3DConstructor = new (
	element: HTMLElement,
	configOptions?: { controlType?: 'trackball' | 'orbit' | 'fly' },
) => ForceGraph3DInstance<Force3DNode, Force3DLink>;

async function loadForceGraph3D(): Promise<ForceGraph3DConstructor> {
	return withSuppressedThreeDuplicateWarning(async () => {
		const module = await import('3d-force-graph');
		return module.default as unknown as ForceGraph3DConstructor;
	});
}

async function loadThree(): Promise<ThreeRuntime> {
	return withSuppressedThreeDuplicateWarning(async () => {
		const module = await import('three');
		return module;
	});
}

async function withSuppressedThreeDuplicateWarning<T>(
	load: () => Promise<T>,
): Promise<T> {
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]) => {
		if (
			typeof args[0] === 'string' &&
			args[0].includes('THREE.WARNING: Multiple instances of Three.js')
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
