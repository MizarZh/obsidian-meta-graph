import { describe, expect, it } from 'vitest';
import { calculateLabelOpacity } from '../graph/label-opacity';

describe('label opacity', () => {
	it('keeps the configured opacity before the fade distance', () => {
		expect(calculateLabelOpacity(1.5, 1)).toBe(1);
		expect(calculateLabelOpacity(1.5, 1.5)).toBe(1);
	});

	it('fades completely over a short distance', () => {
		expect(calculateLabelOpacity(1.5, 1.675)).toBeCloseTo(0.5);
		expect(calculateLabelOpacity(1.5, 1.85)).toBe(0);
		expect(calculateLabelOpacity(1.5, 3)).toBe(0);
	});
});
