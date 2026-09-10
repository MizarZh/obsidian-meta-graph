import { type PlanarGraphExtent } from '@/graph/renderers/planar-viewport-scale';

/** Include actual group bounds in Fit. Never crop the extent to enforce a
 * physical scale: that turns a compact layout into an apparently huge canvas. */
export function flowTitleReferenceExtent(
	extent: PlanarGraphExtent,
	_viewport: { width: number; height: number },
	groups: readonly {
		x: number;
		y: number;
		width: number;
		height: number;
	}[] = [],
): PlanarGraphExtent {
	if (groups.length) {
		let x0 = extent.x[0],
			x1 = extent.x[1],
			y0 = extent.y[0],
			y1 = extent.y[1];
		for (const group of groups) {
			x0 = Math.min(x0, group.x);
			x1 = Math.max(x1, group.x + group.width);
			y0 = Math.min(y0, group.y);
			y1 = Math.max(y1, group.y + group.height);
		}
		extent = {
			x: [x0, x1],
			y: [y0, y1],
			center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
			normalizationRatio: Math.max(x1 - x0, y1 - y0) || 1,
		};
	}
	return extent;
}
