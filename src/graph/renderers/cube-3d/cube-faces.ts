import type * as Three from 'three';

export const FACE_IDS = [
	'cube-front',
	'cube-back',
	'cube-left',
	'cube-right',
	'cube-top',
	'cube-bottom',
] as const;

export type CubeFaceId = (typeof FACE_IDS)[number];

export const RUBIK_FACE_COLORS: Record<CubeFaceId, string> = {
	'cube-front': '#009b48',
	'cube-back': '#0046ad',
	'cube-left': '#ff5800',
	'cube-right': '#b71234',
	'cube-top': '#ffffff',
	'cube-bottom': '#ffd500',
};

export interface CubeFace {
	id: CubeFaceId;
	name: string;
	normal: Three.Vector3;
	u: Three.Vector3;
	v: Three.Vector3;
}

const CUBE_DISPLAY_MIN = -0.72;
const CUBE_DISPLAY_MAX = 0.72;
const CUBE_DISPLAY_OVERLAP = 0.14;

export function createCubeFaces(three: {
	Vector3: typeof Three.Vector3;
}): CubeFace[] {
	const v = three.Vector3;
	return [
		{
			id: 'cube-front',
			name: 'Front',
			normal: new v(0, 0, 1),
			u: new v(1, 0, 0),
			v: new v(0, 1, 0),
		},
		{
			id: 'cube-back',
			name: 'Back',
			normal: new v(0, 0, -1),
			u: new v(-1, 0, 0),
			v: new v(0, 1, 0),
		},
		{
			id: 'cube-left',
			name: 'Left',
			normal: new v(-1, 0, 0),
			u: new v(0, 0, 1),
			v: new v(0, 1, 0),
		},
		{
			id: 'cube-right',
			name: 'Right',
			normal: new v(1, 0, 0),
			u: new v(0, 0, -1),
			v: new v(0, 1, 0),
		},
		{
			id: 'cube-top',
			name: 'Top',
			normal: new v(0, 1, 0),
			u: new v(1, 0, 0),
			v: new v(0, 0, -1),
		},
		{
			id: 'cube-bottom',
			name: 'Bottom',
			normal: new v(0, -1, 0),
			u: new v(1, 0, 0),
			v: new v(0, 0, 1),
		},
	];
}

export function getCubeFace(
	faces: CubeFace[],
	faceId: CubeFaceId,
): CubeFace {
	return faces.find((face) => face.id === faceId) ?? faces[0]!;
}

export function getCubeFaceIdForNode(
	nodeId: string,
	groupId: string | undefined,
): CubeFaceId {
	if (groupId && isCubeFaceId(groupId)) {
		return groupId;
	}
	return FACE_IDS[Math.floor(hashString(nodeId) * FACE_IDS.length)] ?? 'cube-front';
}

export function isCubeFaceId(value: string): value is CubeFaceId {
	return (FACE_IDS as readonly string[]).includes(value);
}

export function findOpenDisplayPosition(
	count: number,
	occupied: Array<{ x: number; y: number }>,
): { x: number; y: number } {
	const candidates = createDisplayGridPositions(count);
	return candidates.reduce(
		(best, candidate) => {
			const score = occupied.reduce(
				(distance, position) =>
					Math.min(distance, distanceSquared(candidate, position)),
				Number.POSITIVE_INFINITY,
			);
			const centerPenalty = distanceSquared(candidate, { x: 0, y: 0 }) * 0.001;
			const value = score - centerPenalty;
			return value > best.value ? { position: candidate, value } : best;
		},
		{
			position: candidates[0] ?? { x: 0, y: 0 },
			value: Number.NEGATIVE_INFINITY,
		},
	).position;
}

export function hasCubeDisplayOverlap(
	left: { x: number; y: number },
	right: { x: number; y: number },
): boolean {
	return (
		distanceSquared(left, right) <
		CUBE_DISPLAY_OVERLAP * CUBE_DISPLAY_OVERLAP
	);
}

export function hashString(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}
	return (hash % 10000) / 10000;
}

function createDisplayGridPositions(count: number): Array<{ x: number; y: number }> {
	const size = CUBE_DISPLAY_MAX - CUBE_DISPLAY_MIN;
	const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
	const rows = Math.max(1, Math.ceil(count / columns));
	const positions: Array<{ x: number; y: number }> = [];
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			positions.push({
				x: CUBE_DISPLAY_MIN + ((column + 1) * size) / (columns + 1),
				y: CUBE_DISPLAY_MIN + ((row + 1) * size) / (rows + 1),
			});
		}
	}
	return positions.sort(
		(left, right) =>
			distanceSquared(left, { x: 0, y: 0 }) -
			distanceSquared(right, { x: 0, y: 0 }),
	);
}

function distanceSquared(
	left: { x: number; y: number },
	right: { x: number; y: number },
): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
}
