import type { ChartGroupShape, GroupFrame, ViewMode } from '../core/types';

export type ResolvedGroupShape = Exclude<ChartGroupShape, 'auto'>;

export interface ViewportGroupRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface ViewportCircleMember {
	x: number;
	y: number;
	radius: number;
}

export function resolveGroupShape(
	mode: ViewMode,
	shape: ChartGroupShape | undefined,
): ResolvedGroupShape {
	if (shape === 'circle' || shape === 'rectangle') {
		return shape;
	}
	return mode === 'graph' ? 'circle' : 'rectangle';
}

export function canMoveGroup(
	mode: ViewMode,
	forceLayoutEnabled: boolean,
): boolean {
	return mode !== 'graph' || forceLayoutEnabled;
}

export function normalizeGroupFrameForShape(
	frame: GroupFrame,
	shape: ResolvedGroupShape,
): GroupFrame {
	if (shape !== 'circle') {
		return frame;
	}
	const diameter = Math.max(frame.width, frame.height);
	return {
		x: frame.x + (frame.width - diameter) / 2,
		y: frame.y + (frame.height - diameter) / 2,
		width: diameter,
		height: diameter,
	};
}

export function fitViewportCircle(
	members: readonly ViewportCircleMember[],
	padding: number,
	minimumDiameter = 0,
): ViewportGroupRect {
	const first = members[0];
	if (!first) {
		return { left: 0, top: 0, width: 0, height: 0 };
	}
	let centerX = first.x;
	let centerY = first.y;
	let radius = Math.max(0, first.radius);
	for (const member of members.slice(1)) {
		const memberRadius = Math.max(0, member.radius);
		const deltaX = member.x - centerX;
		const deltaY = member.y - centerY;
		const distance = Math.hypot(deltaX, deltaY);
		if (distance + memberRadius <= radius) {
			continue;
		}
		if (distance === 0) {
			radius = Math.max(radius, memberRadius);
			continue;
		}
		const nextRadius = (radius + distance + memberRadius) / 2;
		const shift = (nextRadius - radius) / distance;
		centerX += deltaX * shift;
		centerY += deltaY * shift;
		radius = nextRadius;
	}
	radius = Math.max(radius + Math.max(0, padding), minimumDiameter / 2);
	return {
		left: centerX - radius,
		top: centerY - radius,
		width: radius * 2,
		height: radius * 2,
	};
}

export function isViewportPointInGroup(
	point: { x: number; y: number },
	rect: ViewportGroupRect,
	shape: ResolvedGroupShape,
): boolean {
	if (
		point.x < rect.left ||
		point.x > rect.left + rect.width ||
		point.y < rect.top ||
		point.y > rect.top + rect.height
	) {
		return false;
	}
	if (shape === 'rectangle') {
		return true;
	}
	const radius = Math.min(rect.width, rect.height) / 2;
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	return Math.hypot(point.x - centerX, point.y - centerY) <= radius;
}
