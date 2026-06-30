import type { ChartGroup, ChartLayoutConfig } from '../../../core/types';
import { CUBE_FACE_PADDING } from '../../../graph/renderers/cube-3d/cube-constants';
import { spreadOverlappingCubeNodes } from './collision';
import {
	findManualPlacement,
	isPlacementInBounds,
	readGroupPlacementBounds,
	readOccupiedPositions,
} from './placement';

export const CUBE_FACE_GROUPS: ChartGroup[] = [
	{
		id: 'cube-front',
		name: 'Front',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#009b48',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
	{
		id: 'cube-back',
		name: 'Back',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#0046ad',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
	{
		id: 'cube-left',
		name: 'Left',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ff5800',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
	{
		id: 'cube-right',
		name: 'Right',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#b71234',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
	{
		id: 'cube-top',
		name: 'Top',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ffffff',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
	{
		id: 'cube-bottom',
		name: 'Bottom',
		x: -1,
		y: -1,
		width: 2,
		height: 2,
		color: '#ffd500',
		mode: 'manual',
		padding: CUBE_FACE_PADDING,
	},
];

export const CUBE_FACE_IDS = new Set(CUBE_FACE_GROUPS.map((group) => group.id));
export const CUBE_FACE_GROUPS_BY_ID = new Map(
	CUBE_FACE_GROUPS.map((group) => [group.id, group]),
);

export function normalizeCubeLayout(
	layout: ChartLayoutConfig,
	visibleNodeIds: string[],
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const existingGroups = new Map(
		manual.groups.map((group) => [group.id, group]),
	);
	const groups = CUBE_FACE_GROUPS.map((defaultGroup) => ({
		...defaultGroup,
		...(existingGroups.get(defaultGroup.id) ?? {}),
		id: defaultGroup.id,
		color: defaultGroup.color,
	}));
	const nodes = { ...manual.nodes };
	let changed =
		manual.groups.length !== groups.length ||
		groups.some(
			(group, index) =>
				manual.groups[index]?.id !== group.id ||
				manual.groups[index]?.color !== group.color,
		);

		for (const [nodeId, placement] of Object.entries(nodes)) {
			const currentGroup =
				placement.groupId && CUBE_FACE_IDS.has(placement.groupId)
					? (CUBE_FACE_GROUPS_BY_ID.get(placement.groupId) ??
						groups.find((item) => item.id === placement.groupId))
					: undefined;
			if (currentGroup) {
				const bounds = readGroupPlacementBounds(currentGroup);
				if (isPlacementInBounds(placement, bounds)) {
					continue;
				}
				nodes[nodeId] = {
					...clampPlacementToBounds(placement, bounds),
					groupId: currentGroup.id,
				};
				changed = true;
				continue;
			}
			const groupId =
				placement.groupId && CUBE_FACE_IDS.has(placement.groupId)
				? placement.groupId
				: getCubeFaceIdForNode(nodeId);
		const group =
			CUBE_FACE_GROUPS_BY_ID.get(groupId) ??
			groups.find((item) => item.id === groupId);
		const bounds = group ? readGroupPlacementBounds(group) : undefined;
		const occupied = bounds
			? readOccupiedPositions(nodes, groupId, nodeId).filter((position) =>
					isPlacementInBounds(position, bounds),
				)
			: [];
		const position = bounds
			? findManualPlacement(bounds, occupied, groupId, CUBE_FACE_IDS)
			: { x: 0, y: 0 };
		nodes[nodeId] = { ...position, groupId };
		changed = true;
	}

	for (const nodeId of visibleNodeIds) {
		const placement = nodes[nodeId];
		if (placement?.groupId && CUBE_FACE_IDS.has(placement.groupId)) {
			continue;
		}
		const groupId = getCubeFaceIdForNode(nodeId);
		const group =
			CUBE_FACE_GROUPS_BY_ID.get(groupId) ??
			groups.find((item) => item.id === groupId);
		const occupied = readOccupiedPositions(nodes, groupId, nodeId);
		const position =
			placement ??
			(group
				? findManualPlacement(
						readGroupPlacementBounds(group),
						occupied,
						groupId,
						CUBE_FACE_IDS,
					)
				: { x: 0, y: 0 });
		nodes[nodeId] = {
			x: position.x,
			y: position.y,
			groupId,
		};
		changed = true;
	}

	if (
		spreadOverlappingCubeNodes(nodes, visibleNodeIds, groups, CUBE_FACE_IDS)
	) {
		changed = true;
	}

	return changed
		? {
				...layout,
				manual: {
					...manual,
					groups,
					nodes,
				},
			}
		: layout;
}

export function getCubeFaceIdForNode(nodeId: string): string {
	const index = Math.floor(hashString(nodeId) * CUBE_FACE_GROUPS.length);
	return CUBE_FACE_GROUPS[index]?.id ?? CUBE_FACE_GROUPS[0]!.id;
}

function clampPlacementToBounds(
	placement: { x: number; y: number },
	bounds: ReturnType<typeof readGroupPlacementBounds>,
): { x: number; y: number } {
	return {
		x: Math.min(bounds.right, Math.max(bounds.left, placement.x)),
		y: Math.min(bounds.top, Math.max(bounds.bottom, placement.y)),
	};
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}
