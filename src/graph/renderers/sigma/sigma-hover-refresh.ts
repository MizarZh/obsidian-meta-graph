import type { RuntimeGraph } from '../../model/graphology-adapter';

export interface SigmaHoverRefreshState {
	activeNodeId?: string;
	pinnedNodeId?: string;
	neighborhood: ReadonlySet<string>;
	edgeId?: string;
}

export interface SigmaHoverRefreshIndex {
	runtimeEdgeIdsByNode: ReadonlyMap<string, ReadonlySet<string>>;
	runtimeEdgeIdsByLogicalEdge: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface SigmaHoverRefreshPlan {
	nodeIds: string[];
	edgeIds: string[];
}

interface FrameScheduler {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(handle: number): void;
}

export class SigmaHoverRefreshCoordinator {
	private frame?: number;
	private pendingState?: SigmaHoverRefreshState;

	constructor(
		private readonly frames: FrameScheduler,
		private renderedState: SigmaHoverRefreshState,
		private readonly apply: (
			previous: SigmaHoverRefreshState,
			next: SigmaHoverRefreshState,
		) => void,
	) {}

	schedule(state: SigmaHoverRefreshState): void {
		this.pendingState = state;
		if (this.frame !== undefined) return;
		this.frame = this.frames.requestAnimationFrame(() => {
			this.frame = undefined;
			const next = this.pendingState;
			this.pendingState = undefined;
			if (!next) return;
			const previous = this.renderedState;
			this.renderedState = next;
			this.apply(previous, next);
		});
	}

	synchronize(state: SigmaHoverRefreshState): void {
		this.cancel();
		this.renderedState = state;
	}

	dispose(): void {
		this.cancel();
	}

	private cancel(): void {
		if (this.frame !== undefined) {
			this.frames.cancelAnimationFrame(this.frame);
			this.frame = undefined;
		}
		this.pendingState = undefined;
	}
}

export function createSigmaHoverRefreshIndex(
	graph: RuntimeGraph,
): SigmaHoverRefreshIndex {
	const runtimeEdgeIdsByNode = new Map<string, Set<string>>();
	const runtimeEdgeIdsByLogicalEdge = new Map<string, Set<string>>();
	graph.forEachEdge((runtimeEdgeId, attributes, source, target) => {
		addIndexValue(
			runtimeEdgeIdsByLogicalEdge,
			attributes.logicalEdgeId ?? runtimeEdgeId,
			runtimeEdgeId,
		);
		for (const nodeId of new Set([
			source,
			target,
			attributes.logicalSource,
			attributes.logicalTarget,
		])) {
			if (nodeId) {
				addIndexValue(runtimeEdgeIdsByNode, nodeId, runtimeEdgeId);
			}
		}
	});
	return { runtimeEdgeIdsByNode, runtimeEdgeIdsByLogicalEdge };
}

export function createSigmaHoverRefreshPlan(
	graph: RuntimeGraph,
	index: SigmaHoverRefreshIndex,
	previous: SigmaHoverRefreshState,
	next: SigmaHoverRefreshState,
): SigmaHoverRefreshPlan {
	const nodeIds = new Set<string>();
	const edgeIds = new Set<string>();
	if (previous.activeNodeId !== next.activeNodeId) {
		if (!previous.activeNodeId || !next.activeNodeId) {
			graph.nodes().forEach((nodeId) => nodeIds.add(nodeId));
			graph.edges().forEach((edgeId) => edgeIds.add(edgeId));
		} else {
			addSetDifference(nodeIds, previous.neighborhood, next.neighborhood);
			addSetDifference(nodeIds, next.neighborhood, previous.neighborhood);
			nodeIds.add(previous.activeNodeId);
			nodeIds.add(next.activeNodeId);
			addIndexedValues(
				edgeIds,
				index.runtimeEdgeIdsByNode,
				previous.activeNodeId,
			);
			addIndexedValues(
				edgeIds,
				index.runtimeEdgeIdsByNode,
				next.activeNodeId,
			);
		}
	}
	if (previous.edgeId !== next.edgeId) {
		addIndexedValues(
			edgeIds,
			index.runtimeEdgeIdsByLogicalEdge,
			previous.edgeId,
		);
		addIndexedValues(
			edgeIds,
			index.runtimeEdgeIdsByLogicalEdge,
			next.edgeId,
		);
	}
	if (previous.pinnedNodeId !== next.pinnedNodeId) {
		addIndexedValues(
			edgeIds,
			index.runtimeEdgeIdsByLogicalEdge,
			previous.edgeId,
		);
		addIndexedValues(
			edgeIds,
			index.runtimeEdgeIdsByLogicalEdge,
			next.edgeId,
		);
	}
	return { nodeIds: [...nodeIds], edgeIds: [...edgeIds] };
}

function addIndexValue(
	index: Map<string, Set<string>>,
	key: string,
	value: string,
): void {
	const values = index.get(key) ?? new Set<string>();
	values.add(value);
	index.set(key, values);
}

function addIndexedValues(
	target: Set<string>,
	index: ReadonlyMap<string, ReadonlySet<string>>,
	key?: string,
): void {
	if (!key) return;
	for (const value of index.get(key) ?? []) {
		target.add(value);
	}
}

function addSetDifference(
	target: Set<string>,
	left: ReadonlySet<string>,
	right: ReadonlySet<string>,
): void {
	for (const value of left) {
		if (!right.has(value)) target.add(value);
	}
}
