import type { LayoutGroupGeometry } from '@/layouts/group-geometry';

/** All coordinates are layout graph coordinates, before viewport normalization. */
export interface PlanarPoint {
	x: number;
	y: number;
}

/** Explicit path commands avoid renderer-specific curve interpolation. */
export type PlanarPathCommand =
	| { kind: 'line'; to: PlanarPoint }
	| { kind: 'quadratic'; control: PlanarPoint; to: PlanarPoint }
	| {
			kind: 'cubic';
			control1: PlanarPoint;
			control2: PlanarPoint;
			to: PlanarPoint;
	  };

export interface PlanarEdgeRoute {
	/** Canonical logical ID, never a generated segment ID. */
	id: string;
	source: string;
	target: string;
	start: PlanarPoint;
	commands: readonly PlanarPathCommand[];
	/** Layout-owned routes already include parallel lane offsets. */
	parallelRouteOwner: 'layout' | 'renderer';
	/** Explicit placements allow arrows and labels inside a route; angles are radians. */
	arrow?: { position: PlanarPoint; angle: number };
	label?: { position: PlanarPoint; angle: number };
}

/** Geometry only; colors, visibility and selection remain runtime style state. */
export interface PlanarLayoutGeometry {
	/** Optional during migration; absence means use existing runtime routes. */
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>;
	groupGeometries: LayoutGroupGeometry[];
}
