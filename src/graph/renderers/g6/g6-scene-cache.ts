import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';
import type {
	GraphPosition,
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import {
	getPlanarGraphExtent,
	type PlanarGraphExtent,
} from '@/graph/renderers/planar-viewport-scale';
import {
	createG6LabelVisibilityIndex,
	isG6RenderedNode,
	type G6LabelVisibilityIndex,
} from '@/graph/renderers/g6/g6-data';
import {
	resolveG6RotatedNodeLabelStyle,
	type G6NodeStyle,
	type G6VisualScale,
} from '@/graph/renderers/g6/g6-styles';

interface RotatedLabelCacheEntry {
	key: string;
	style: G6NodeStyle;
}

interface SpatialEntry extends GraphPosition {
	id: string;
}

/** Immutable graph indexes plus small mutable visual caches for one G6 scene. */
export class G6SceneCache {
	readonly renderedNodeIds = new Set<string>();
	readonly runtimeEdgesByLogicalId = new Map<string, readonly string[]>();
	readonly incidentEdgesByNode = new Map<string, ReadonlySet<string>>();
	readonly neighborNodeIdsByNode = new Map<string, ReadonlySet<string>>();
	readonly edgeElementByRuntimeEdgeId = new Map<string, string>();
	readonly nodeSpatialIndex: G6NodeSpatialIndex;
	labelVisibilityIndex: G6LabelVisibilityIndex;
	maxRenderedNodeSize = 0;
	private extentValue: PlanarGraphExtent;
	private extentDirty = false;
	private readonly rotatedLabelStyles = new Map<
		string,
		RotatedLabelCacheEntry
	>();
	private readonly nodeStyleKeys = new Map<string, string>();
	private readonly edgeStyleKeys = new Map<string, string>();

	constructor(
		private graph: RuntimeGraph,
		private routes?: ReadonlyMap<string, PlanarEdgeRoute>,
	) {
		this.extentValue = getPlanarGraphExtent(graph);
		this.labelVisibilityIndex = createG6LabelVisibilityIndex(graph);
		this.nodeSpatialIndex = new G6NodeSpatialIndex(
			this.extentValue,
			graph.order,
		);
		this.rebuild();
	}

	get graphExtent(): PlanarGraphExtent {
		if (this.extentDirty) {
			this.extentValue = getPlanarGraphExtent(this.graph);
			this.extentDirty = false;
		}
		return this.extentValue;
	}

	get logicalEdgeCount(): number {
		return this.routes?.size ?? this.graph.size;
	}

	refreshLabelIndex(): void {
		this.labelVisibilityIndex = createG6LabelVisibilityIndex(this.graph);
		this.rotatedLabelStyles.clear();
	}

	getRotatedLabelStyle(
		nodeId: string,
		attributes: RuntimeNodeAttributes,
		visualScale: G6VisualScale | undefined,
		labelStyle: G6NodeStyle,
	): G6NodeStyle {
		const key = [
			attributes.labelRotation,
			attributes.labelDirection,
			attributes.size,
			visualScale?.geometry,
			visualScale?.label,
			labelStyle.labelPlacement,
			labelStyle.labelOffsetX,
			labelStyle.labelOffsetY,
			labelStyle.labelFontSize,
		].join('\0');
		const cached = this.rotatedLabelStyles.get(nodeId);
		if (cached?.key === key) return cached.style;
		const style = resolveG6RotatedNodeLabelStyle(
			attributes,
			visualScale,
			labelStyle,
		);
		this.rotatedLabelStyles.set(nodeId, { key, style });
		return style;
	}

	collectStyleChanges(): {
		nodeIds: string[];
		edgeIds: string[];
	} {
		const nodeIds: string[] = [];
		const edgeIds: string[] = [];
		let maxRenderedNodeSize = 0;
		this.graph.forEachNode((nodeId, attributes) => {
			if (!this.renderedNodeIds.has(nodeId)) return;
			maxRenderedNodeSize = Math.max(
				maxRenderedNodeSize,
				attributes.size,
			);
			const key = createNodeStyleKey(attributes);
			if (this.nodeStyleKeys.get(nodeId) !== key) nodeIds.push(nodeId);
			this.nodeStyleKeys.set(nodeId, key);
		});
		this.maxRenderedNodeSize = maxRenderedNodeSize;
		this.graph.forEachEdge((edgeId, attributes) => {
			const key = createEdgeStyleKey(attributes);
			if (this.edgeStyleKeys.get(edgeId) !== key) edgeIds.push(edgeId);
			this.edgeStyleKeys.set(edgeId, key);
		});
		return { nodeIds, edgeIds };
	}

	updateNodePosition(nodeId: string, position: GraphPosition): void {
		if (!this.renderedNodeIds.has(nodeId)) return;
		this.nodeSpatialIndex.update(nodeId, position);
		this.extentDirty = true;
	}

	private rebuild(): void {
		const mutableLogicalEdges = new Map<string, string[]>();
		const mutableIncident = new Map<string, Set<string>>();
		const mutableNeighbors = new Map<string, Set<string>>();
		this.graph.forEachNode((nodeId, attributes) => {
			if (!isG6RenderedNode(attributes, this.routes)) return;
			this.renderedNodeIds.add(nodeId);
			this.maxRenderedNodeSize = Math.max(
				this.maxRenderedNodeSize,
				attributes.size,
			);
			this.nodeSpatialIndex.add(nodeId, attributes);
			this.nodeStyleKeys.set(nodeId, createNodeStyleKey(attributes));
		});
		this.graph.forEachEdge((edgeId, attributes, source, target) => {
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const runtimeEdges = mutableLogicalEdges.get(logicalEdgeId) ?? [];
			runtimeEdges.push(edgeId);
			mutableLogicalEdges.set(logicalEdgeId, runtimeEdges);
			this.edgeElementByRuntimeEdgeId.set(
				edgeId,
				this.routes?.has(logicalEdgeId) ? logicalEdgeId : edgeId,
			);
			this.edgeStyleKeys.set(edgeId, createEdgeStyleKey(attributes));
			const endpoints = new Set(
				[
					source,
					target,
					attributes.logicalSource,
					attributes.logicalTarget,
				].filter((id): id is string => Boolean(id)),
			);
			for (const nodeId of endpoints) {
				const incident = mutableIncident.get(nodeId) ?? new Set();
				incident.add(edgeId);
				mutableIncident.set(nodeId, incident);
			}
			const neighborSource = attributes.logicalSource ?? source;
			const neighborTarget = attributes.logicalTarget ?? target;
			addNeighbors(mutableNeighbors, neighborSource, neighborTarget);
			addNeighbors(mutableNeighbors, neighborTarget, neighborSource);
		});
		for (const [id, edgeIds] of mutableLogicalEdges) {
			this.runtimeEdgesByLogicalId.set(id, edgeIds);
		}
		for (const [id, edgeIds] of mutableIncident) {
			this.incidentEdgesByNode.set(id, edgeIds);
		}
		for (const nodeId of this.renderedNodeIds) {
			this.neighborNodeIdsByNode.set(
				nodeId,
				mutableNeighbors.get(nodeId) ?? new Set([nodeId]),
			);
		}
	}
}

export class G6NodeSpatialIndex {
	private readonly entries = new Map<string, SpatialEntry>();
	private readonly cells = new Map<string, Set<string>>();
	private readonly cellSize: number;

	constructor(extent: PlanarGraphExtent, nodeCount: number) {
		this.cellSize = Math.max(
			1,
			extent.normalizationRatio / Math.max(1, Math.sqrt(nodeCount)),
		);
	}

	add(id: string, position: GraphPosition): void {
		this.entries.set(id, { id, x: position.x, y: position.y });
		this.addToCell(id, position);
	}

	update(id: string, position: GraphPosition): void {
		const previous = this.entries.get(id);
		if (previous) this.cells.get(this.key(previous))?.delete(id);
		this.add(id, position);
	}

	query(position: GraphPosition, radius: number): string[] {
		const ids = new Set<string>();
		const minX = Math.floor((position.x - radius) / this.cellSize);
		const maxX = Math.floor((position.x + radius) / this.cellSize);
		const minY = Math.floor((position.y - radius) / this.cellSize);
		const maxY = Math.floor((position.y + radius) / this.cellSize);
		for (let x = minX; x <= maxX; x += 1) {
			for (let y = minY; y <= maxY; y += 1) {
				for (const id of this.cells.get(`${x}:${y}`) ?? []) ids.add(id);
			}
		}
		return [...ids];
	}

	private addToCell(id: string, position: GraphPosition): void {
		const key = this.key(position);
		const ids = this.cells.get(key) ?? new Set();
		ids.add(id);
		this.cells.set(key, ids);
	}

	private key(position: GraphPosition): string {
		return `${Math.floor(position.x / this.cellSize)}:${Math.floor(position.y / this.cellSize)}`;
	}
}

function createNodeStyleKey(attributes: RuntimeNodeAttributes): string {
	return [
		attributes.type,
		attributes.size,
		attributes.color,
		attributes.opacity,
		attributes.hidden,
		attributes.label,
		attributes.labelRotation,
		attributes.labelDirection,
	].join('\0');
}

function addNeighbors(
	index: Map<string, Set<string>>,
	nodeId: string,
	neighborId: string,
): void {
	const neighbors = index.get(nodeId) ?? new Set([nodeId]);
	neighbors.add(neighborId);
	index.set(nodeId, neighbors);
}

function createEdgeStyleKey(attributes: RuntimeEdgeAttributes): string {
	return [
		attributes.type,
		attributes.size,
		attributes.color,
		attributes.opacity,
		attributes.hidden,
		attributes.label,
		attributes.forceLabel,
		attributes.lineStyle,
		attributes.arrowStyle,
		attributes.arrowSize,
		attributes.parallelLane,
		attributes.parallelCount,
	].join('\0');
}
