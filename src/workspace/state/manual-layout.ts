import type { ChartLayoutConfig } from '../../core/types';
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
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const previous = new Set(previousPaths);
	const addedPaths = nextPaths.filter((path) => !previous.has(path));
	if (addedPaths.length === 0) {
		return layout;
	}
	const isCubeLayout = layout.engine === 'cube-3d';
	const group = groupId
		? (isCubeLayout
				? CUBE_FACE_GROUPS_BY_ID.get(groupId)
				: manual.groups.find((item) => item.id === groupId))
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
			? (isCubeLayout
					? CUBE_FACE_GROUPS_BY_ID.get(placementGroupId)
					: manual.groups.find((item) => item.id === placementGroupId))
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
					? placement.groupId === placementGroup.id
					: placement.groupId === undefined,
			)
			.map(([, placement]) => ({ x: placement.x, y: placement.y }));
		const existing = nodes[path];
		if (existing && (!placementGroupId || existing.groupId === placementGroupId)) {
			continue;
		}
		const position = findManualPlacement(
			bounds,
			occupied,
			placementGroupId,
			CUBE_FACE_IDS,
		);
		newPositions.push(position);
		nodes[path] = placementGroupId ? { ...position, groupId: placementGroupId } : position;
	}
	const groups =
		group && newPositions.length > 0 && !CUBE_FACE_IDS.has(group.id)
			? manual.groups.map((item) =>
					item.id === group.id ? expandGroupToPositions(item, newPositions) : item,
				)
			: manual.groups;
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			groups,
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
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const movingPaths = new Set(paths);
	const group = groupId
		? (layout.engine === 'cube-3d'
				? CUBE_FACE_GROUPS_BY_ID.get(groupId)
				: manual.groups.find((item) => item.id === groupId))
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
			return group ? placement.groupId === group.id : placement.groupId === undefined;
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
		const nextPlacement = groupId ? { ...position, groupId } : position;
		const nextGroupId = groupId ?? undefined;
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
	const groups =
		group && newPositions.length > 0 && !CUBE_FACE_IDS.has(group.id)
			? manual.groups.map((item) =>
					item.id === group.id ? expandGroupToPositions(item, newPositions) : item,
				)
			: manual.groups;
	return {
		...layout,
		manual: {
			...manual,
			nodes,
			groups,
		},
	};
}
