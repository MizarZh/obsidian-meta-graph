import type { LabelPosition } from '../../core/types';
import type { LayoutGroupGeometry } from '../../layouts/group-geometry';
import type { PlanarEdgeRoute } from '../../layouts/planar-geometry';
import type { GraphPosition, RuntimeGraph } from '../model/graphology-adapter';
import type { GraphPalette } from '../styles/graph-styles';
import type { RendererCapabilities } from './renderer-capabilities';
import type { LabelThemeConfig } from './renderer-label-style';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from './renderer-groups';

export interface ForceSimulationRenderer {
	readonly runtimeGraph: RuntimeGraph;
	beginForceMotion(): void;
	endForceMotion(): void;
	clearHeldBounds(): void;
	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	};
}

/** Renderer-neutral contract shared by 2D graph implementations. */
export interface PlanarRenderer {
	readonly capabilities: RendererCapabilities;
	readonly runtimeGraph: RuntimeGraph;
	setGraph(graph: RuntimeGraph): void;
	setPalette(palette: GraphPalette): void;
	refresh(): void;
	refreshGraphStyles(): void;
	refreshGraphVisibility(changes: {
		nodeIds: readonly string[];
		edgeIds: readonly string[];
	}): void;
	setGroups(
		groups: GroupOverlayGroup[],
		callbacks?: GroupInteractionCallbacks,
	): void;
	setLayoutGroupGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void;
	/** Optional while layout-owned routes migrate renderer by renderer. */
	setLayoutEdgeRoutes?(routes?: ReadonlyMap<string, PlanarEdgeRoute>): void;
	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined;
	getNodeAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined;
	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	};
	graphToViewportPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	};
	getNodePosition(nodeId: string): GraphPosition | undefined;
	setNodePosition(nodeId: string, position: GraphPosition): void;
	moveNodesBy(nodeIds: Iterable<string>, delta: GraphPosition): void;
	setActiveDropGroup(groupId?: string): void;
	setSelected(nodeId?: string): void;
	setSelectedEdge(edgeId?: string): void;
	setSelectedGroup(groupId?: string): void;
	setHovered(nodeId?: string): void;
	setFadeDistance(fadeDistance: number): void;
	setLabelSize(labelSize: number): void;
	setScaleLabelsWithZoom(scaleLabelsWithZoom: boolean): void;
	setLabelBold(labelBold: boolean): void;
	setLabelItalic(labelItalic: boolean): void;
	setLabelPosition(labelPosition: LabelPosition): void;
	setLabelOffset(labelOffset: number): void;
	setLabelTheme(labelTheme: LabelThemeConfig): void;
	setLabelDensity(labelDensity: number): void;
	setForceLabels(forceLabels: boolean): void;
	togglePinnedHover(nodeId: string): void;
	clearPinnedHover(): void;
	focusNode(nodeId: string): void;
	fit(): void;
	zoomBy(factor: number): void;
	getZoomLevel(): number;
	setZoomLevel(level: number): void;
	onZoomLevelChange(listener: (level: number) => void): () => void;
	resize(): void;
	holdCurrentBounds(): void;
	clearHeldBounds(): void;
	kill(): void;
}
