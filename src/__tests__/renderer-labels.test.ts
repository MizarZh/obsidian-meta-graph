import { describe, expect, it } from 'vitest';
import { resolveThreeLabelPixelRatio } from '../graph/renderers/renderer-labels';

describe('3D renderer labels', () => {
	it('preserves the existing device ratio for standard clarity', () => {
		expect(resolveThreeLabelPixelRatio('standard', 1)).toBe(1);
		expect(resolveThreeLabelPixelRatio('standard', 2)).toBe(2);
		expect(resolveThreeLabelPixelRatio('standard', 3)).toBe(2);
	});

	it('uses higher fixed texture ratios for clearer labels', () => {
		expect(resolveThreeLabelPixelRatio('high', 1)).toBe(3);
		expect(resolveThreeLabelPixelRatio('ultra', 1)).toBe(4);
	});
});
