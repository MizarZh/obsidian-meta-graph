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
}

export interface RadialGroupGeometry extends LayoutGroupGeometryBase {
	kind: 'radial-sector';
	startAngle: number;
	endAngle: number;
	radius: number;
}

export type LayoutGroupGeometry = ArcGroupGeometry | RadialGroupGeometry;
