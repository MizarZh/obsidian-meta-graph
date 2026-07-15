import type { ArcDirection } from '../core/types';

interface LayoutGroupGeometryBase {
	groupId: string;
	name: string;
	color: string;
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

export type LayoutGroupGeometry =
	| ArcGroupGeometry
	| RadialGroupGeometry
	| FlowGroupGeometry
	| GraphGroupGeometry;

export function normalizeLayoutGroupPadding(padding: number): number {
	return Math.min(5, Math.max(0, padding));
}

export function scaleLayoutGroupPadding(padding: number): number {
	const normalized = normalizeLayoutGroupPadding(padding);
	return normalized === 0 ? 0 : normalized / (normalized + 0.68);
}
