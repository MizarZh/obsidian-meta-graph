import type { ArcDirection } from '../core/types';

interface LayoutGroupGeometryBase {
	groupId: string;
	name: string;
	color: string;
	nodeIds: string[];
}

export interface ArcGroupGeometry extends LayoutGroupGeometryBase {
	kind: 'arc-band';
	direction: ArcDirection;
	start: number;
	end: number;
	halfWidth: number;
}

export interface RadialGroupGeometry extends LayoutGroupGeometryBase {
	kind: 'radial-sector';
	startAngle: number;
	endAngle: number;
	innerRadius: number;
	outerRadius: number;
}

export interface FlowGroupGeometry extends LayoutGroupGeometryBase {
	kind: 'flow-container';
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GraphGroupGeometry extends LayoutGroupGeometryBase {
	kind: 'graph-container';
	nodeIds: string[];
	padding: number;
}

export interface GroupMemberHaloGeometry extends LayoutGroupGeometryBase {
	kind: 'member-halos';
	nodeIds: string[];
}

export type LayoutGroupGeometry =
	| ArcGroupGeometry
	| RadialGroupGeometry
	| FlowGroupGeometry
	| GraphGroupGeometry
	| GroupMemberHaloGeometry;

export type ResolvedGroupVisual = LayoutGroupGeometry;

export function isGraphPointInLayoutGroup(
	geometry: LayoutGroupGeometry,
	point: { x: number; y: number },
): boolean {
	if (geometry.kind === 'flow-container') {
		return (
			point.x >= geometry.x &&
			point.x <= geometry.x + geometry.width &&
			point.y >= geometry.y &&
			point.y <= geometry.y + geometry.height
		);
	}
	if (geometry.kind === 'arc-band') {
		const axis =
			geometry.direction === 'right' || geometry.direction === 'left'
				? point.y
				: point.x;
		const cross =
			geometry.direction === 'right' || geometry.direction === 'left'
				? point.x
				: point.y;
		return (
			axis >= geometry.start &&
			axis <= geometry.end &&
			Math.abs(cross) <= geometry.halfWidth
		);
	}
	if (geometry.kind === 'radial-sector') {
		const radius = Math.hypot(point.x, point.y);
		if (radius < geometry.innerRadius || radius > geometry.outerRadius) {
			return false;
		}
		const fullTurn = Math.PI * 2;
		let angle = Math.atan2(point.y, point.x);
		while (angle < geometry.startAngle) angle += fullTurn;
		while (angle > geometry.startAngle + fullTurn) angle -= fullTurn;
		return angle <= geometry.endAngle;
	}
	return false;
}

export function normalizeLayoutGroupPadding(padding: number): number {
	return Math.min(5, Math.max(0, padding));
}

export function scaleLayoutGroupPadding(padding: number): number {
	const normalized = normalizeLayoutGroupPadding(padding);
	return normalized === 0 ? 0 : normalized / (normalized + 0.68);
}
