import { Graph, GraphEvent, type GraphOptions } from '@antv/g6';
import type { LabelPosition } from '../../../core/types';
import type { LayoutGroupGeometry } from '../../../layouts/group-geometry';
import type { RuntimeGraph } from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';
import type { RendererCapabilities } from '../renderer-capabilities';
import type { PlanarRenderer } from '../renderer-contracts';
import type { LabelThemeConfig } from '../renderer-label-style';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '../renderer-groups';
import type { G6RendererOptions } from '../renderer-options';
import { createG6StylePatch, toG6Data } from './g6-data';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const FIT_DURATION = 350;
const FOCUS_DURATION = 350;
const ZOOM_DURATION = 180;

export type G6GraphInstance = Pick<
	Graph,
	| 'destroy'
	| 'draw'
	| 'fitView'
	| 'focusElement'
	| 'getCanvasByViewport'
	| 'getViewportByCanvas'
	| 'getZoom'
	| 'off'
	| 'on'
	| 'resize'
	| 'setData'
	| 'setOptions'
	| 'updateData'
	| 'zoomBy'
	| 'zoomTo'
>;

export type G6GraphFactory = (options: GraphOptions) => G6GraphInstance;

export class G6Renderer implements PlanarRenderer {
	readonly capabilities: RendererCapabilities = {
		kind: 'g6',
		supportsGroupOverlay: false,
		supportsLayoutGroupGeometry: false,
		supportsManualLayout: false,
		supportsEdgePicking: false,
		supportsNodeDragging: false,
		supportsConnectionMoveScheduling: false,
		supportsExternal2DForceSimulation: false,
	};
	readonly instance: G6GraphInstance;
	private graph: RuntimeGraph;
	private readonly isStale: () => boolean;
	private readonly zoomLevelListeners = new Set<(level: number) => void>();
	private drawQueue: Promise<void> = Promise.resolve();
	private killed = false;
	private readonly handleViewportChange = (): void => {
		this.emitZoomLevel();
	};

	private constructor(options: G6RendererOptions, instance: G6GraphInstance) {
		this.graph = options.graph;
		this.isStale = options.isStale;
		this.instance = instance;
		this.instance.on(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
	}

	static async create(
		options: G6RendererOptions,
		createGraph: G6GraphFactory = (graphOptions) => new Graph(graphOptions),
	): Promise<G6Renderer | undefined> {
		if (options.isStale()) return undefined;
		const instance = createGraph(createG6GraphOptions(options));
		const renderer = new G6Renderer(options, instance);
		try {
			await instance.draw();
		} catch (error) {
			renderer.kill();
			throw error;
		}
		if (options.isStale()) {
			renderer.kill();
			return undefined;
		}
		return renderer;
	}

	get runtimeGraph(): RuntimeGraph {
		return this.graph;
	}

	setGraph(graph: RuntimeGraph): void {
		this.graph = graph;
		this.instance.setData(toG6Data(graph));
		this.scheduleDraw();
	}

	setPalette(palette: GraphPalette): void {
		this.instance.setOptions({ background: palette.background });
		this.scheduleDraw();
	}

	refresh(): void {
		this.scheduleDraw();
	}

	refreshGraphStyles(): void {
		this.instance.updateData(
			createG6StylePatch(this.graph, {
				nodeIds: this.graph.nodes(),
				edgeIds: this.graph.edges(),
			}),
		);
		this.scheduleDraw();
	}

	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void {
		this.instance.updateData(createG6StylePatch(this.graph, changes));
		this.scheduleDraw();
	}

	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getCanvasByViewport([position.x, position.y]);
		return { x: point[0], y: point[1] };
	}

	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	} {
		const point = this.instance.getViewportByCanvas([position.x, position.y]);
		return { x: point[0], y: point[1] };
	}

	focusNode(nodeId: string): void {
		if (!this.graph.hasNode(nodeId)) return;
		const attributes = this.graph.getNodeAttributes(nodeId);
		if (attributes.hidden || attributes.isBend) return;
		this.runViewportAction(() =>
			this.instance.focusElement(nodeId, { duration: FOCUS_DURATION }),
		);
	}

	fit(): void {
		this.runViewportAction(() =>
			this.instance.fitView(
				{ when: 'always', direction: 'both' },
				{ duration: FIT_DURATION },
			),
		);
	}

	zoomBy(factor: number): void {
		if (!Number.isFinite(factor) || factor <= 0) return;
		this.runViewportAction(() =>
			this.instance.zoomBy(factor, { duration: ZOOM_DURATION }),
		);
	}

	getZoomLevel(): number {
		return this.instance.getZoom() * 100;
	}

	setZoomLevel(level: number): void {
		if (!Number.isFinite(level)) return;
		const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level / 100));
		this.runViewportAction(() => this.instance.zoomTo(zoom, false));
	}

	onZoomLevelChange(listener: (level: number) => void): () => void {
		this.zoomLevelListeners.add(listener);
		return () => this.zoomLevelListeners.delete(listener);
	}

	resize(): void {
		if (this.killed) return;
		this.instance.resize();
		this.scheduleDraw();
	}

	kill(): void {
		if (this.killed) return;
		this.killed = true;
		this.instance.off(GraphEvent.AFTER_TRANSFORM, this.handleViewportChange);
		this.zoomLevelListeners.clear();
		this.instance.destroy();
	}

	setGroups(
		_groups: GroupOverlayGroup[],
		_callbacks?: GroupInteractionCallbacks,
	): void {}

	setLayoutGroupGeometries(
		_geometries: readonly LayoutGroupGeometry[],
		_getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {}

	getGroupAtViewportPosition(_position: {
		x: number;
		y: number;
	}): string | undefined {
		return undefined;
	}

	getNodeAtViewportPosition(_position: {
		x: number;
		y: number;
	}): string | undefined {
		return undefined;
	}

	setActiveDropGroup(_groupId?: string): void {}
	setSelected(_nodeId?: string): void {}
	setSelectedEdge(_edgeId?: string): void {}
	setSelectedGroup(_groupId?: string): void {}
	setHovered(_nodeId?: string): void {}
	setFadeDistance(_fadeDistance: number): void {}
	setLabelSize(_labelSize: number): void {}
	setScaleLabelsWithZoom(_scaleLabelsWithZoom: boolean): void {}
	setLabelBold(_labelBold: boolean): void {}
	setLabelItalic(_labelItalic: boolean): void {}
	setLabelPosition(_labelPosition: LabelPosition): void {}
	setLabelOffset(_labelOffset: number): void {}
	setLabelTheme(_labelTheme: LabelThemeConfig): void {}
	setLabelDensity(_labelDensity: number): void {}
	setForceLabels(_forceLabels: boolean): void {}
	togglePinnedHover(_nodeId: string): void {}
	clearPinnedHover(): void {}
	holdCurrentBounds(): void {}
	clearHeldBounds(): void {}

	private scheduleDraw(): void {
		if (this.killed || this.isStale()) return;
		this.drawQueue = this.drawQueue
			.then(async () => {
				if (this.killed || this.isStale()) return;
				await this.instance.draw();
			})
			.catch(() => undefined);
	}

	private runViewportAction(action: () => Promise<void>): void {
		if (this.killed || this.isStale()) return;
		void action()
			.then(() => {
				if (!this.killed && !this.isStale()) this.emitZoomLevel();
			})
			.catch(() => undefined);
	}

	private emitZoomLevel(): void {
		const level = this.getZoomLevel();
		this.zoomLevelListeners.forEach((listener) => listener(level));
	}
}

export function createG6GraphOptions(options: G6RendererOptions): GraphOptions {
	return {
		container: options.container,
		data: toG6Data(options.graph),
		animation: false,
		autoResize: false,
		background: options.palette.background,
		padding: 32,
		zoomRange: [MIN_ZOOM, MAX_ZOOM],
		behaviors: ['drag-canvas', 'zoom-canvas'],
	};
}
