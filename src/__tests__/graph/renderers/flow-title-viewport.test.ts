import { describe, it, expect } from 'vitest';
import { flowTitleReferenceExtent } from '@/graph/renderers/flow-title-viewport';
import {
	calculateSigmaCompatibleFitZoom,
	type PlanarGraphExtent,
} from '@/graph/renderers/planar-viewport-scale';

describe('Flow group fit extent', () => {
	it.each([
		[10000, 3000],
		[3000, 10000],
		[100, 50],
		[10000, 10000],
	])(
		'does not crop a %s x %s graph to force a physical scale',
		(width, height) => {
			const extent: PlanarGraphExtent = {
				x: [0, width],
				y: [0, height],
				center: { x: width / 2, y: height / 2 },
				normalizationRatio: Math.max(width, height),
			};
			const viewport = { width: 600, height: 400 };
			const reference = flowTitleReferenceExtent(extent, viewport);
			expect(reference).toEqual(extent);
			expect(calculateSigmaCompatibleFitZoom(reference, viewport)).toBe(
				calculateSigmaCompatibleFitZoom(extent, viewport),
			);
			expect(reference.center).toEqual(extent.center);
			expect(extent.x).toEqual([0, width]);
		},
	);
});
