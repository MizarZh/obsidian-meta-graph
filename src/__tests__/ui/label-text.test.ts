import { describe, expect, it } from 'vitest';
import { normalizeLabelMaxWidth, truncateLabel } from '@/graph/label-text';

const measure = (text: string) =>
	Array.from(text).reduce(
		(width, char) => width + (char === '.' ? 2 : char === 'i' ? 3 : 10),
		0,
	);
describe('label pixel width', () => {
	it('keeps unlimited and fitting text unchanged', () => {
		expect(truncateLabel('Long label', 0, measure)).toBe('Long label');
		expect(truncateLabel('abc', 30, measure)).toBe('abc');
		expect(truncateLabel('', 5, measure)).toBe('');
	});
	it('uses measured width rather than character count and includes the suffix', () => {
		expect(truncateLabel('iiiiiiiiii', 26, measure)).toBe('iiiiii...');
		expect(truncateLabel('WWWWWWWWWW', 26, measure)).toBe('WW...');
		expect(truncateLabel('金融市场与投资', 26, measure)).toBe('金融...');
		expect(truncateLabel('😀😃😄', 26, measure)).toBe('😀😃...');
		expect(truncateLabel('abcdef', 26, (text) => measure(text) * 2)).toBe(
			'...',
		);
	});
	it('never exceeds the width, even when only the suffix or nothing fits', () => {
		expect(truncateLabel('abc', 6, measure)).toBe('...');
		expect(truncateLabel('abc', 5, measure)).toBe('');
		for (let width = 1; width < 100; width++)
			expect(
				measure(truncateLabel('iii金融WW😀', width, measure)),
			).toBeLessThanOrEqual(width);
	});
	it('normalizes invalid and fractional limits', () => {
		for (const value of [-1, NaN, Infinity, undefined, '20'])
			expect(normalizeLabelMaxWidth(value)).toBe(0);
		expect(normalizeLabelMaxWidth(30.9)).toBe(30);
	});
});
