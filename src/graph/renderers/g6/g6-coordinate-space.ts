import type {
	GraphPosition,
	RuntimeGraph,
} from '../../model/graphology-adapter';
import { getPlanarGraphExtent } from '../planar-viewport-scale';

/**
 * Keeps G6 near its normal coordinate/zoom range for Free charts, whose
 * persisted coordinates commonly span only a few units. Sigma performs an
 * equivalent normalization internally.
 */
export const MIN_G6_COORDINATE_SPAN = 500;

export interface G6CoordinateSpace {
	readonly scale: number;
	toG6(position: GraphPosition): GraphPosition;
	toGraph(position: GraphPosition): GraphPosition;
}

export function createG6CoordinateSpace(
	graph: RuntimeGraph,
): G6CoordinateSpace {
	const extent = getPlanarGraphExtent(graph);
	const scale = Math.max(
		1,
		MIN_G6_COORDINATE_SPAN / extent.normalizationRatio,
	);
	const origin = extent.center;
	return {
		scale,
		toG6: (position) => ({
			x: origin.x + (position.x - origin.x) * scale,
			y: origin.y + (position.y - origin.y) * scale,
		}),
		toGraph: (position) => ({
			x: origin.x + (position.x - origin.x) / scale,
			y: origin.y + (position.y - origin.y) / scale,
		}),
	};
}
