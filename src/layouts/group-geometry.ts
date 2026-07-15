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

export type LayoutGroupGeometry = ArcGroupGeometry | RadialGroupGeometry;

export function normalizeLayoutGroupPadding(padding: number): number {
	return Math.min(1, Math.max(0, padding));
}
