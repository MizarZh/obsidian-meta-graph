import type { ChartGroup } from '../../../core/types';
import {
	distanceSquared,
	findManualPlacement,
	readGroupPlacementBounds,
} from './placement';

const CUBE_NODE_OVERLAP_DISTANCE = 0.08;

export function spreadOverlappingCubeNodes(
	nodes: Record<string, { x: number; y: number; groupId?: string }>,
	visibleNodeIds: string[],
	groups: ChartGroup[],
	cubeFaceIds: ReadonlySet<string>,
): boolean {
	let changed = false;
	const visible = new Set(visibleNodeIds);
	for (const group of groups) {
		const occupied: Array<{ x: number; y: number }> = [];
		const nodeIds = Object.entries(nodes)
			.filter(
				([nodeId, placement]) =>
					visible.has(nodeId) && placement.groupId === group.id,
			)
			.map(([nodeId]) => nodeId)
			.sort((left, right) => left.localeCompare(right));
		for (const nodeId of nodeIds) {
			const placement = nodes[nodeId];
			if (!placement) {
				continue;
			}
			const overlaps = occupied.some(
				(position) =>
					distanceSquared(position, placement) <
					CUBE_NODE_OVERLAP_DISTANCE * CUBE_NODE_OVERLAP_DISTANCE,
			);
			if (!overlaps) {
				occupied.push({ x: placement.x, y: placement.y });
				continue;
			}
			const position = findManualPlacement(
				readGroupPlacementBounds(group),
				occupied,
				group.id,
				cubeFaceIds,
			);
			nodes[nodeId] = { ...position, groupId: group.id };
			occupied.push(position);
			changed = true;
		}
	}
	return changed;
}
