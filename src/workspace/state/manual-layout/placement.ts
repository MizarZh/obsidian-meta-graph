import type { ChartGroup } from '../../../core/types';

export const MANUAL_NODE_SPACING = 0.62;

export interface PlacementBounds {
	left: number;
	right: number;
	bottom: number;
	top: number;
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
	cubeFaceIds?: ReadonlySet<string>,
): { x: number; y: number } {
	if (!groupId || !cubeFaceIds?.has(groupId)) {
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

export function readOccupiedPositions(
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

export function isPlacementInBounds(
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

export function isPositionInsideGroup(
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

export function readUngroupedPlacementBounds(
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

export function expandGroupToPositions(
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

export function distanceSquared(
	left: { x: number; y: number },
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
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
