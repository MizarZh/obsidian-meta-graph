import type {
	ChartGroupDefinition,
	ChartLayoutConfig,
	GroupFrame,
} from '../../core/types';
import { normalizePath } from '../../core/knowledge-index';
import {
	CUBE_FACE_GROUPS_BY_ID,
	CUBE_FACE_IDS,
	getCubeFaceIdForNode,
} from './manual-layout/cube-layout';
import {
	expandGroupToPositions,
	findManualPlacement,
	isPositionInsideGroup,
	readGroupPlacementBounds,
	readUngroupedPlacementBounds,
} from './manual-layout/placement';
import { createFramedGroup, getGroupFrame } from './manual-layout/groups';

export {
	CUBE_FACE_GROUPS,
	normalizeCubeLayout,
} from './manual-layout/cube-layout';
export {
	createUniqueDefaultGroup,
	getManualGroup,
	normalizeGroupPatch,
} from './manual-layout/groups';
export {
	findManualPlacement,
	readGroupPlacementBounds,
	type PlacementBounds,
} from './manual-layout/placement';

export function addManualPlacements(
	layout: ChartLayoutConfig,
	previousPaths: string[],
	nextPaths: string[],
	groupId?: string,
	groupDefinition?: ChartGroupDefinition,
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const previous = new Set(previousPaths);
	const addedPaths = nextPaths.filter((path) => !previous.has(path));
	if (addedPaths.length === 0) {
		return layout;
	}
	const isCubeLayout = layout.engine === 'cube-3d';
	const group = groupId
		? isCubeLayout
			? CUBE_FACE_GROUPS_BY_ID.get(groupId)
			: createGroupFromFrame(layout, groupDefinition, groupId)
		: undefined;
	if (groupId && !group) {
		return layout;
	}
	const nodes = { ...manual.nodes };
	const newPositions: Array<{ x: number; y: number }> = [];
	for (const path of addedPaths) {
		const placementGroupId =
			groupId ?? (isCubeLayout ? getCubeFaceIdForNode(path) : undefined);
		const placementGroup = placementGroupId
			? isCubeLayout
				? CUBE_FACE_GROUPS_BY_ID.get(placementGroupId)
				: createGroupFromFrame(
						layout,
						groupDefinition,
						placementGroupId,
					)
			: undefined;
		if (placementGroupId && !placementGroup) {
			continue;
		}
		const bounds = placementGroup
			? readGroupPlacementBounds(placementGroup)
			: readUngroupedPlacementBounds(Object.values(nodes));
		const occupied = Object.entries(nodes)
			.filter(([, placement]) =>
				placementGroup
					? isCubeLayout
						? placement.groupId === placementGroup.id
						: isPositionInsideGroup(placement, placementGroup)
					: isCubeLayout
						? placement.groupId === undefined
						: true,
			)
			.map(([, placement]) => ({ x: placement.x, y: placement.y }));
		const existing = nodes[path];
		if (
			existing &&
			(!placementGroupId ||
				(isCubeLayout
					? existing.groupId === placementGroupId
					: Boolean(
							placementGroup &&
							isPositionInsideGroup(existing, placementGroup),
						)))
		) {
			continue;
		}
		const position = findManualPlacement(
			bounds,
			occupied,
			placementGroupId,
			CUBE_FACE_IDS,
		);
		newPositions.push(position);
		nodes[path] =
			placementGroupId && isCubeLayout
				? { ...position, groupId: placementGroupId }
				: position;
	}
	const groupFrames = updateExpandedGroupFrame(
		manual.groupFrames,
		group,
		newPositions,
		isCubeLayout,
	);
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			...(groupFrames ? { groupFrames } : {}),
		},
	};
}

export function removeManualPlacements(
	layout: ChartLayoutConfig,
	paths: string[],
): ChartLayoutConfig {
	const manual = layout.manual;
	if (!manual || paths.length === 0) {
		return layout;
	}
	const removedPaths = new Set(paths.map((path) => normalizePath(path)));
	const nodes = Object.fromEntries(
		Object.entries(manual.nodes).filter(
			([nodeId]) => !removedPaths.has(normalizePath(nodeId)),
		),
	);
	if (Object.keys(nodes).length === Object.keys(manual.nodes).length) {
		return layout;
	}
	return {
		...layout,
		manual: {
			...manual,
			nodes,
		},
	};
}

export function moveManualNodesToGroup(
	layout: ChartLayoutConfig,
	paths: string[],
	groupId?: string,
	groupDefinition?: ChartGroupDefinition,
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const isCubeLayout = layout.engine === 'cube-3d';
	const movingPaths = new Set(paths);
	const group = groupId
		? isCubeLayout
			? CUBE_FACE_GROUPS_BY_ID.get(groupId)
			: createGroupFromFrame(layout, groupDefinition, groupId)
		: undefined;
	if (groupId && !group) {
		return layout;
	}
	const bounds = group
		? readGroupPlacementBounds(group)
		: readUngroupedPlacementBounds(
				Object.entries(manual.nodes)
					.filter(([nodeId]) => !movingPaths.has(nodeId))
					.map(([, placement]) => placement),
			);
	const occupied = Object.entries(manual.nodes)
		.filter(([nodeId, placement]) => {
			if (movingPaths.has(nodeId)) {
				return false;
			}
			return group
				? isCubeLayout
					? placement.groupId === group.id
					: isPositionInsideGroup(placement, group)
				: isCubeLayout
					? placement.groupId === undefined
					: true;
		})
		.map(([, placement]) => ({ x: placement.x, y: placement.y }));
	const nodes = { ...manual.nodes };
	const newPositions: Array<{ x: number; y: number }> = [];
	let changed = false;
	for (const path of paths) {
		const previous = manual.nodes[path];
		const position =
			previous && (!group || isPositionInsideGroup(previous, group))
				? { x: previous.x, y: previous.y }
				: findManualPlacement(bounds, occupied, groupId, CUBE_FACE_IDS);
		occupied.push(position);
		newPositions.push(position);
		const nextPlacement =
			groupId && isCubeLayout ? { ...position, groupId } : position;
		const nextGroupId = groupId && isCubeLayout ? groupId : undefined;
		if (
			previous?.x !== nextPlacement.x ||
			previous?.y !== nextPlacement.y ||
			previous?.groupId !== nextGroupId
		) {
			changed = true;
		}
		nodes[path] = nextPlacement;
	}
	if (!changed) {
		return layout;
	}
	const groupFrames = updateExpandedGroupFrame(
		manual.groupFrames,
		group,
		newPositions,
		isCubeLayout,
	);
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			...(groupFrames ? { groupFrames } : {}),
		},
	};
}

function createGroupFromFrame(
	layout: ChartLayoutConfig,
	definition: ChartGroupDefinition | undefined,
	groupId: string,
) {
	const frame = getGroupFrame(layout, groupId);
	return definition && frame
		? createFramedGroup(definition, frame)
		: undefined;
}

function updateExpandedGroupFrame(
	frames: Record<string, GroupFrame> | undefined,
	group: ReturnType<typeof createGroupFromFrame>,
	positions: Array<{ x: number; y: number }>,
	isCubeLayout: boolean,
): Record<string, GroupFrame> | undefined {
	if (!group || positions.length === 0 || isCubeLayout) {
		return frames;
	}
	const expanded = expandGroupToPositions(group, positions);
	return {
		...frames,
		[group.id]: {
			x: expanded.x,
			y: expanded.y,
			width: expanded.width,
			height: expanded.height,
		},
	};
}
