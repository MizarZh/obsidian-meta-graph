import type { FlowDirection } from '../core/types';
import type { GraphPosition, RuntimeGraph } from '../graph/graphology-adapter';

const BASE_LAYER_DISTANCE = 220;
const BASE_CROSS_STEP = 90;
const COLLISION_X_THRESHOLD = 150;
const COLLISION_Y_THRESHOLD = 80;
const FLOW_SLOT_ATTEMPTS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];

export interface FlowInsertionOptions {
	flowDirection: FlowDirection;
	flowSpacing: number;
}

interface FlowInsertionDirection {
	x: number;
	y: number;
	crossX: number;
	crossY: number;
}

export function placeNewFlowNodes(
	graph: RuntimeGraph,
	positions: ReadonlyMap<string, GraphPosition>,
	newNodeIds: string[],
	options: FlowInsertionOptions,
): void {
	if (newNodeIds.length === 0) {
		return;
	}

	const occupied = new Map<string, GraphPosition>(
		[...positions.entries()].filter(([nodeId]) => graph.hasNode(nodeId)),
	);

	for (const nodeId of newNodeIds) {
		const placement = findFlowInsertionPlacement(
			graph,
			occupied,
			nodeId,
			options,
		);
		if (!placement) {
			continue;
		}
		graph.mergeNodeAttributes(nodeId, {
			x: placement.x,
			y: placement.y,
			fixed: true,
		});
		occupied.set(nodeId, placement);
	}
}

export function findFlowInsertionPlacement(
	graph: RuntimeGraph,
	occupied: ReadonlyMap<string, GraphPosition>,
	nodeId: string,
	options: FlowInsertionOptions,
): GraphPosition | undefined {
	for (const edge of graph.edges()) {
		const source = graph.source(edge);
		const target = graph.target(edge);
		const anchorId =
			source === nodeId && occupied.has(target)
				? target
				: target === nodeId && occupied.has(source)
					? source
					: undefined;
		if (!anchorId) {
			continue;
		}

		const anchor = occupied.get(anchorId);
		if (!anchor) {
			continue;
		}

		const newNodeIsAfterAnchor = source === anchorId && target === nodeId;
		return findOpenFlowSlot(anchor, newNodeIsAfterAnchor, occupied, options);
	}

	return undefined;
}

export function findOpenFlowSlot(
	anchor: GraphPosition,
	newNodeIsAfterAnchor: boolean,
	occupied: ReadonlyMap<string, GraphPosition>,
	options: FlowInsertionOptions,
): GraphPosition {
	const direction = getFlowInsertionDirection(
		options.flowDirection,
		newNodeIsAfterAnchor,
	);
	const layerDistance = BASE_LAYER_DISTANCE * options.flowSpacing;
	const crossStep = BASE_CROSS_STEP * options.flowSpacing;

	for (const attempt of FLOW_SLOT_ATTEMPTS) {
		const candidate = {
			x:
				anchor.x +
				direction.x * layerDistance +
				direction.crossX * crossStep * attempt,
			y:
				anchor.y +
				direction.y * layerDistance +
				direction.crossY * crossStep * attempt,
		};
		if (!flowSlotCollides(candidate, occupied)) {
			return candidate;
		}
	}

	const fallbackOffset = crossStep * (FLOW_SLOT_ATTEMPTS.length + 1);
	return {
		x:
			anchor.x +
			direction.x * layerDistance +
			direction.crossX * fallbackOffset,
		y:
			anchor.y +
			direction.y * layerDistance +
			direction.crossY * fallbackOffset,
	};
}

export function getFlowInsertionDirection(
	flowDirection: FlowDirection,
	newNodeIsAfterAnchor: boolean,
): FlowInsertionDirection {
	const forward = flowDirection === 'RL' || flowDirection === 'DT' ? -1 : 1;
	const sign = newNodeIsAfterAnchor ? forward : -forward;

	if (flowDirection === 'LR' || flowDirection === 'RL') {
		return { x: sign, y: 0, crossX: 0, crossY: 1 };
	}

	return { x: 0, y: sign, crossX: 1, crossY: 0 };
}

function flowSlotCollides(
	candidate: GraphPosition,
	occupied: ReadonlyMap<string, GraphPosition>,
): boolean {
	for (const position of occupied.values()) {
		if (
			Math.abs(position.x - candidate.x) < COLLISION_X_THRESHOLD &&
			Math.abs(position.y - candidate.y) < COLLISION_Y_THRESHOLD
		) {
			return true;
		}
	}

	return false;
}
