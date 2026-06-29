import type { ChartGroup, ChartLayoutConfig } from '../core/types';
import { normalizePath } from '../core/knowledge-index';

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
		padding: 0.22,
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
		padding: 0.22,
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
		padding: 0.22,
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
		padding: 0.22,
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
		padding: 0.22,
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
		padding: 0.22,
	},
];

const CUBE_FACE_IDS = new Set(CUBE_FACE_GROUPS.map((group) => group.id));
const CUBE_FACE_GROUPS_BY_ID = new Map(
	CUBE_FACE_GROUPS.map((group) => [group.id, group]),
);
const MANUAL_NODE_SPACING = 0.62;
const CUBE_NODE_OVERLAP_DISTANCE = 0.08;

export interface PlacementBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
}

export function getManualGroup(
	layout: ChartLayoutConfig,
	chartType: string,
	groupId: string,
): ChartGroup | undefined {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	return (
		manual.groups.find((item) => item.id === groupId) ??
		(chartType === 'cube' ? CUBE_FACE_GROUPS_BY_ID.get(groupId) : undefined)
	);
}

export function createUniqueDefaultGroup(
	existingGroups: ChartGroup[],
): ChartGroup {
	const existingIds = new Set(existingGroups.map((group) => group.id));
	let index = existingGroups.length + 1;
	let group = createDefaultGroup(index);
	while (existingIds.has(group.id)) {
		index += 1;
		group = createDefaultGroup(index);
	}
	return group;
}

export function normalizeGroupPatch(
	group: ChartGroup,
	patch: Partial<ChartGroup>,
): ChartGroup {
	return {
		...group,
		...patch,
		name:
			typeof patch.name === 'string' && patch.name.trim()
				? patch.name.trim()
				: group.name,
		width:
			typeof patch.width === 'number' && Number.isFinite(patch.width)
				? Math.max(0.8, patch.width)
				: group.width,
		height:
			typeof patch.height === 'number' && Number.isFinite(patch.height)
				? Math.max(0.6, patch.height)
				: group.height,
		padding:
			typeof patch.padding === 'number' && Number.isFinite(patch.padding)
				? Math.max(0, patch.padding)
				: group.padding,
		mode: patch.mode === 'rule' ? 'rule' : (patch.mode ?? group.mode),
	};
}

export function normalizeCubeLayout(
	layout: ChartLayoutConfig,
	visibleNodeIds: string[],
): ChartLayoutConfig {
	const manual = layout.manual ?? { nodes: {}, groups: [] };
	const existingGroups = new Map(manual.groups.map((group) => [group.id, group]));
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
		if (
			currentGroup &&
			isPlacementInBounds(placement, readGroupPlacementBounds(currentGroup))
		) {
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
			? findManualPlacement(bounds, occupied, groupId)
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
				? findManualPlacement(readGroupPlacementBounds(group), occupied, groupId)
				: { x: 0, y: 0 });
		nodes[nodeId] = {
			x: position.x,
			y: position.y,
			groupId,
		};
		changed = true;
	}

	if (spreadOverlappingCubeNodes(nodes, visibleNodeIds, groups)) {
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
		const position = findManualPlacement(bounds, occupied, placementGroupId);
		newPositions.push(position);
		nodes[path] = placementGroupId
			? { ...position, groupId: placementGroupId }
			: position;
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
			return group
				? placement.groupId === group.id
				: placement.groupId === undefined;
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
				: findManualPlacement(bounds, occupied, groupId);
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

export function readGroupPlacementBounds(group: ChartGroup): PlacementBounds {
	const padding = Math.min(group.padding, group.width / 3, group.height / 3);
	return {
		left: group.x + padding,
		right: group.x + group.width - padding,
		bottom: group.y + padding,
		top: group.y + group.height - padding,
	};
}

export function findManualPlacement(
	bounds: PlacementBounds,
	occupied: Array<{ x: number; y: number }>,
	groupId?: string,
): { x: number; y: number } {
	if (!groupId || !CUBE_FACE_IDS.has(groupId)) {
		return findOpenManualPlacement(bounds, occupied);
	}
	const candidates = createBoundedGridPositions(bounds, occupied.length + 1);
	return candidates.reduce(
		(best, candidate) => {
			const score = occupied.reduce(
				(distance, placement) =>
					Math.min(distance, distanceSquared(candidate, placement)),
				Number.POSITIVE_INFINITY,
			);
			const center = {
				x: (bounds.left + bounds.right) / 2,
				y: (bounds.bottom + bounds.top) / 2,
			};
			const centerPenalty = distanceSquared(candidate, center) * 0.001;
			const value = score - centerPenalty;
			return value > best.value ? { position: candidate, value } : best;
		},
		{
			position:
				candidates[0] ?? {
					x: (bounds.left + bounds.right) / 2,
					y: (bounds.bottom + bounds.top) / 2,
				},
			value: Number.NEGATIVE_INFINITY,
		},
	).position;
}

function createDefaultGroup(index: number): ChartGroup {
	return {
		id: createGroupId(`Group ${index}`),
		name: `Group ${index}`,
		x: -1.6,
		y: -1.1,
		width: 3.2,
		height: 2.2,
		color: '#7c6ff0',
		mode: 'manual',
		padding: 0.32,
	};
}

function getCubeFaceIdForNode(nodeId: string): string {
	const index = Math.floor(hashString(nodeId) * CUBE_FACE_GROUPS.length);
	return CUBE_FACE_GROUPS[index]?.id ?? CUBE_FACE_GROUPS[0]!.id;
}

function readOccupiedPositions(
	nodes: Record<string, { x: number; y: number; groupId?: string }>,
	groupId: string,
	excludeNodeId?: string,
): Array<{ x: number; y: number }> {
	return Object.entries(nodes)
		.filter(
			([nodeId, placement]) =>
				nodeId !== excludeNodeId && placement.groupId === groupId,
		)
		.map(([, placement]) => ({ x: placement.x, y: placement.y }));
}

function isPlacementInBounds(
	position: { x: number; y: number },
	bounds: PlacementBounds,
): boolean {
	return (
		Number.isFinite(position.x) &&
		Number.isFinite(position.y) &&
		position.x >= bounds.left &&
		position.x <= bounds.right &&
		position.y >= bounds.bottom &&
		position.y <= bounds.top
	);
}

function spreadOverlappingCubeNodes(
	nodes: Record<string, { x: number; y: number; groupId?: string }>,
	visibleNodeIds: string[],
	groups: ChartGroup[],
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
			);
			nodes[nodeId] = { ...position, groupId: group.id };
			occupied.push(position);
			changed = true;
		}
	}
	return changed;
}

function isPositionInsideGroup(
	position: { x: number; y: number },
	group: ChartGroup,
): boolean {
	return (
		position.x >= group.x &&
		position.x <= group.x + group.width &&
		position.y >= group.y &&
		position.y <= group.y + group.height
	);
}

function readUngroupedPlacementBounds(
	placements: Array<{ x: number; y: number }>,
): PlacementBounds {
	if (placements.length === 0) {
		return { left: -1.6, right: 1.6, bottom: -1.1, top: 1.1 };
	}
	const center = placements.reduce(
		(total, placement) => ({
			x: total.x + placement.x / placements.length,
			y: total.y + placement.y / placements.length,
		}),
		{ x: 0, y: 0 },
	);
	return {
		left: center.x - 1.6,
		right: center.x + 1.6,
		bottom: center.y - 1.1,
		top: center.y + 1.1,
	};
}

function findOpenManualPlacement(
	bounds: PlacementBounds,
	occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
	const center = {
		x: (bounds.left + bounds.right) / 2,
		y: (bounds.bottom + bounds.top) / 2,
	};
	for (let expansion = 0; expansion < 6; expansion += 1) {
		const expanded = expandBounds(bounds, expansion * MANUAL_NODE_SPACING);
		const candidates = createPlacementCandidates(expanded, center);
		const candidate = candidates.find((position) =>
			isManualPlacementOpen(position, occupied),
		);
		if (candidate) {
			return candidate;
		}
	}
	return {
		x: center.x + occupied.length * MANUAL_NODE_SPACING,
		y: center.y,
	};
}

function createBoundedGridPositions(
	bounds: PlacementBounds,
	count: number,
): Array<{ x: number; y: number }> {
	if (count <= 0) {
		return [];
	}
	const width = Math.max(bounds.right - bounds.left, 0.001);
	const height = Math.max(bounds.top - bounds.bottom, 0.001);
	const columns = Math.max(1, Math.ceil(Math.sqrt(count * (width / height))));
	const rows = Math.max(1, Math.ceil(count / columns));
	const positions: Array<{ x: number; y: number }> = [];
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			positions.push({
				x: bounds.left + ((column + 1) * width) / (columns + 1),
				y: bounds.bottom + ((row + 1) * height) / (rows + 1),
			});
		}
	}
	const center = {
		x: (bounds.left + bounds.right) / 2,
		y: (bounds.bottom + bounds.top) / 2,
	};
	return positions
		.sort(
			(left, right) =>
				distanceSquared(left, center) - distanceSquared(right, center),
		)
		.slice(0, count);
}

function createPlacementCandidates(
	bounds: PlacementBounds,
	center: { x: number; y: number },
): Array<{ x: number; y: number }> {
	const candidates: Array<{ x: number; y: number }> = [];
	const columns = Math.max(
		1,
		Math.floor((bounds.right - bounds.left) / MANUAL_NODE_SPACING) + 1,
	);
	const rows = Math.max(
		1,
		Math.floor((bounds.top - bounds.bottom) / MANUAL_NODE_SPACING) + 1,
	);
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			candidates.push({
				x: bounds.left + column * MANUAL_NODE_SPACING,
				y: bounds.bottom + row * MANUAL_NODE_SPACING,
			});
		}
	}
	candidates.push(center);
	return candidates.sort((left, right) => {
		const leftDistance = distanceSquared(left, center);
		const rightDistance = distanceSquared(right, center);
		return leftDistance - rightDistance;
	});
}

function isManualPlacementOpen(
	position: { x: number; y: number },
	occupied: Array<{ x: number; y: number }>,
): boolean {
	return occupied.every(
		(placement) =>
			distanceSquared(position, placement) >=
			MANUAL_NODE_SPACING * MANUAL_NODE_SPACING,
	);
}

function expandBounds(bounds: PlacementBounds, amount: number): PlacementBounds {
	return {
		left: bounds.left - amount,
		right: bounds.right + amount,
		bottom: bounds.bottom - amount,
		top: bounds.top + amount,
	};
}

function expandGroupToPositions(
	group: ChartGroup,
	positions: Array<{ x: number; y: number }>,
): ChartGroup {
	const padding = group.padding;
	const left = Math.min(
		group.x,
		...positions.map((position) => position.x - padding),
	);
	const right = Math.max(
		group.x + group.width,
		...positions.map((position) => position.x + padding),
	);
	const bottom = Math.min(
		group.y,
		...positions.map((position) => position.y - padding),
	);
	const top = Math.max(
		group.y + group.height,
		...positions.map((position) => position.y + padding),
	);
	return {
		...group,
		x: left,
		y: bottom,
		width: right - left,
		height: top - bottom,
	};
}

function distanceSquared(
	left: { x: number; y: number },
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
}

function createGroupId(name: string): string {
	const slug = name
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `group-${slug || Date.now().toString(36)}`;
}
