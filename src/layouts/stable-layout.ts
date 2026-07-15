import type {
	ArcDirection,
	ArcLabelAngle,
	ChartGroupDefinition,
	FlowDirection,
	FlowEdgeStyle,
	FlowRelationRule,
	LayoutNodeSort,
	LayoutSortDirection,
	ManualLayoutConfig,
	ViewMode,
} from '../core/types';
import type {
	GraphPosition,
	RuntimeGraph,
} from '../graph/model/graphology-adapter';
import { ArcLayout } from './arc-layout';
import {
	applyOrthogonalFlowEdges,
	createFlowGroupGeometriesFromGraph,
	ElkFlowLayout,
	type OrthogonalRouteMap,
} from './elk-flow-layout';
import { ForceAtlasLayout, type GraphForceSettings } from './force-layout';
import { placeNewFlowNodes } from './flow-insertion';
import {
	createGraphGroupGeometries,
	createGroupMemberHaloGeometries,
} from './graph-group-layout';
import { HierarchicalEdgeBundlingLayout } from './hierarchical-edge-bundling-layout';
import type { LayoutGroupGeometry } from './group-geometry';

export interface LayoutSnapshot {
	positions: Map<string, GraphPosition>;
	edgeIds: Set<string>;
	orthogonalRoutes: OrthogonalRouteMap;
	groupGeometries: LayoutGroupGeometry[];
	flowRelationConflictCount?: number;
}

export interface LayoutSnapshotKeyOptions {
	activeChartId?: string;
	mode: ViewMode;
	arcDirection: ArcDirection;
	nodeSort: LayoutNodeSort;
	nodeSortDirection: LayoutSortDirection;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
}

export interface StableLayoutOptions {
	mode: ViewMode;
	forceLayout: boolean;
	graphSpacing: number;
	graphForceSettings: GraphForceSettings;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
	flowRelationRules?: FlowRelationRule[];
	flowLayerSpacing: number;
	flowLaneSpacing: number;
	arcSpacing: number;
	arcDirection: ArcDirection;
	arcLabelAngle: ArcLabelAngle;
	nodeSort: LayoutNodeSort;
	nodeSortDirection: LayoutSortDirection;
	groups?: readonly ChartGroupDefinition[];
	groupByNode?: ReadonlyMap<string, string>;
}

interface StableLayoutContext {
	graph: RuntimeGraph;
	snapshot: LayoutSnapshot;
	newNodeIds: string[];
	options: StableLayoutOptions;
	firstLayout: boolean;
	currentEdgeIds: Set<string>;
}

type StableLayoutStrategy = (context: StableLayoutContext) => Promise<void>;

const LAYOUT_STRATEGIES: Record<ViewMode, StableLayoutStrategy> = {
	graph: applyGraphLayout,
	'graph-3d': applyGraph3DLayout,
	cube: applyCubeLayout,
	free: applyFreeLayout,
	flow: applyFlowLayout,
	arc: applyArcLayout,
	'hierarchical-edge-bundling': applyHierarchicalEdgeBundlingLayout,
};

export function createLayoutSnapshot(): LayoutSnapshot {
	return {
		positions: new Map(),
		edgeIds: new Set(),
		orthogonalRoutes: createOrthogonalRouteMap(),
		groupGeometries: [],
		flowRelationConflictCount: 0,
	};
}

export class LayoutSnapshotStore {
	private readonly snapshots = new Map<string, LayoutSnapshot>();

	get(options: LayoutSnapshotKeyOptions): LayoutSnapshot {
		const key = getLayoutSnapshotKey(options);
		let snapshot = this.snapshots.get(key);
		if (!snapshot) {
			snapshot = createLayoutSnapshot();
			this.snapshots.set(key, snapshot);
		}

		return snapshot;
	}
}

export async function applyStableLayout(
	graph: RuntimeGraph,
	snapshot: LayoutSnapshot,
	newNodeIds: string[],
	options: StableLayoutOptions,
): Promise<void> {
	const context: StableLayoutContext = {
		graph,
		snapshot,
		newNodeIds,
		options,
		firstLayout: snapshot.positions.size === 0,
		currentEdgeIds: getLogicalEdgeIds(graph),
	};

	await LAYOUT_STRATEGIES[options.mode](context);
	snapshotRuntimePositions(graph, snapshot.positions);
}

export function getLayoutSnapshotKey(
	options: LayoutSnapshotKeyOptions,
): string {
	if (options.mode === 'arc') {
		return `${options.activeChartId}-arc-${options.arcDirection}-${options.nodeSort}-${options.nodeSortDirection}`;
	}

	if (options.mode === 'hierarchical-edge-bundling') {
		return `${options.activeChartId}-hierarchical-edge-bundling-${options.nodeSort}-${options.nodeSortDirection}`;
	}

	if (options.mode === 'flow') {
		return `${options.activeChartId}-flow-${options.flowEdgeStyle}-${options.flowDirection}`;
	}

	return `${options.activeChartId}-${options.mode}`;
}

export function hydrateManualLayoutPositions(
	snapshot: LayoutSnapshot,
	mode: ViewMode,
	manualLayout: ManualLayoutConfig,
): void {
	if (mode !== 'free' && mode !== 'cube') {
		return;
	}

	for (const [nodeId, placement] of Object.entries(manualLayout.nodes)) {
		snapshot.positions.set(nodeId, { x: placement.x, y: placement.y });
	}
}

export function getLogicalEdgeIds(graph: RuntimeGraph): Set<string> {
	return new Set(
		graph.edges().filter((edge) => !graph.getEdgeAttribute(edge, 'hidden')),
	);
}

async function applyArcLayout({
	graph,
	snapshot,
	currentEdgeIds,
	options,
}: StableLayoutContext): Promise<void> {
	const layout = new ArcLayout(
		options.arcSpacing,
		options.arcDirection,
		options.nodeSort,
		options.nodeSortDirection,
		options.arcLabelAngle,
		options.groups,
		options.groupByNode,
	);
	await layout.apply(graph);
	snapshot.groupGeometries = layout.getGroupGeometries();
	snapshot.edgeIds = currentEdgeIds;
	snapshot.orthogonalRoutes = createOrthogonalRouteMap();
}

async function applyHierarchicalEdgeBundlingLayout({
	graph,
	snapshot,
	currentEdgeIds,
	options,
}: StableLayoutContext): Promise<void> {
	const layout = new HierarchicalEdgeBundlingLayout(
		1,
		options.nodeSort,
		options.nodeSortDirection,
		options.groups,
		options.groupByNode,
	);
	await layout.apply(graph);
	snapshot.groupGeometries = layout.getGroupGeometries();
	snapshot.edgeIds = currentEdgeIds;
	snapshot.orthogonalRoutes = createOrthogonalRouteMap();
}

async function applyFlowLayout(context: StableLayoutContext): Promise<void> {
	const {
		graph,
		snapshot,
		newNodeIds,
		options,
		firstLayout,
		currentEdgeIds,
	} = context;
	const flowEdgesChanged = !setsEqual(currentEdgeIds, snapshot.edgeIds);
	const needsFlowLayout = options.forceLayout || firstLayout;

	if (needsFlowLayout) {
		const layout = new ElkFlowLayout(
			options.flowEdgeStyle,
			options.flowDirection,
			options.flowLayerSpacing,
			options.flowLaneSpacing,
			options.flowRelationRules,
			options.groups,
			options.groupByNode,
		);
		await layout.apply(graph);
		snapshot.flowRelationConflictCount = layout.getConflictCount();
		snapshot.groupGeometries = layout.getGroupGeometries();
		snapshot.edgeIds = currentEdgeIds;
		snapshot.orthogonalRoutes =
			options.flowEdgeStyle === 'orthogonal'
				? layout.getOrthogonalRoutes()
				: createOrthogonalRouteMap();
	} else {
		placeNewFlowNodes(graph, snapshot.positions, newNodeIds, {
			flowDirection: options.flowDirection,
			flowLayerSpacing: options.flowLayerSpacing,
			flowLaneSpacing: options.flowLaneSpacing,
		});
		if (options.flowEdgeStyle === 'orthogonal') {
			applyOrthogonalFlowEdges(graph, snapshot.orthogonalRoutes);
		}
		snapshot.groupGeometries = createFlowGroupGeometriesFromGraph(
			graph,
			options.groups ?? [],
			options.groupByNode ?? new Map(),
		);
	}

	if (flowEdgesChanged) {
		snapshot.edgeIds = currentEdgeIds;
	}
}

async function applyFreeLayout({
	graph,
	snapshot,
	currentEdgeIds,
	options,
}: StableLayoutContext): Promise<void> {
	snapshot.edgeIds = currentEdgeIds;
	snapshot.orthogonalRoutes = createOrthogonalRouteMap();
	snapshot.groupGeometries = createGroupMemberHaloGeometries(
		graph,
		options.groups ?? [],
		options.groupByNode ?? new Map(),
	);
}

async function applyGraphLayout({
	graph,
	snapshot,
	options,
	firstLayout,
	currentEdgeIds,
}: StableLayoutContext): Promise<void> {
	if (firstLayout || options.forceLayout) {
		await new ForceAtlasLayout(
			options.graphSpacing,
			options.graphForceSettings,
			options.groupByNode,
		).apply(graph);
	}
	snapshot.groupGeometries = createGraphGroupGeometries(
		graph,
		options.groups ?? [],
		options.groupByNode ?? new Map(),
	);
	snapshot.edgeIds = currentEdgeIds;
	snapshot.orthogonalRoutes = createOrthogonalRouteMap();
}

async function applyGraph3DLayout({
	snapshot,
	currentEdgeIds,
}: StableLayoutContext): Promise<void> {
	snapshot.edgeIds = currentEdgeIds;
}

async function applyCubeLayout({
	snapshot,
	currentEdgeIds,
}: StableLayoutContext): Promise<void> {
	snapshot.edgeIds = currentEdgeIds;
	snapshot.orthogonalRoutes = createOrthogonalRouteMap();
}

function snapshotRuntimePositions(
	graph: RuntimeGraph,
	positions: Map<string, GraphPosition>,
): void {
	graph.forEachNode((nodeId, attributes) => {
		if (!attributes.isBend) {
			positions.set(nodeId, { x: attributes.x, y: attributes.y });
		}
		graph.setNodeAttribute(nodeId, 'fixed', false);
	});
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
	return (
		left.size === right.size && [...left].every((value) => right.has(value))
	);
}

function createOrthogonalRouteMap(): OrthogonalRouteMap {
	return new Map();
}
