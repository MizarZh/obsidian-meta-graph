import { describe, expect, it, vi } from 'vitest';
import { CanvasTextWidthCache } from '../graph/renderers/sigma/canvas-text-metrics';
import { fitEdgeLabel } from '../graph/renderers/sigma/sigma-label-rendering';

function createContext() {
	let font = '';
	const measureText = vi.fn((text: string) => ({ width: text.length * 100 }));
	const context = {
		get font() {
			return font;
		},
		set font(value: string) {
			font = value;
		},
		save: vi.fn(),
		restore: vi.fn(),
		measureText,
	} as unknown as CanvasRenderingContext2D;
	return { context, measureText };
}

describe('CanvasTextWidthCache', () => {
	it('reuses one normalized measurement across zoom sizes', () => {
		const { context, measureText } = createContext();
		const cache = new CanvasTextWidthCache();
		const font = { family: 'Inter', weight: 600, size: 10 };

		expect(cache.measure(context, 'label', font)).toBe(50);
		expect(cache.measure(context, 'label', { ...font, size: 20 })).toBe(100);
		expect(measureText).toHaveBeenCalledOnce();
	});

	it('separates entries by text and font appearance', () => {
		const { context, measureText } = createContext();
		const cache = new CanvasTextWidthCache();

		cache.measure(context, 'one', {
			family: 'Inter',
			weight: 400,
			style: 'normal',
			size: 10,
		});
		cache.measure(context, 'one', {
			family: 'Inter',
			weight: 700,
			style: 'normal',
			size: 10,
		});
		cache.measure(context, 'two', {
			family: 'Inter',
			weight: 400,
			style: 'normal',
			size: 10,
		});

		expect(measureText).toHaveBeenCalledTimes(3);
	});

	it('evicts old entries when bounded capacity is reached', () => {
		const { context, measureText } = createContext();
		const cache = new CanvasTextWidthCache(1);
		const font = { family: 'Inter', weight: 400, size: 10 };

		cache.measure(context, 'one', font);
		cache.measure(context, 'two', font);
		cache.measure(context, 'one', font);

		expect(measureText).toHaveBeenCalledTimes(3);
	});
});

describe('fitEdgeLabel', () => {
	it('finds the longest cached-width prefix that fits', () => {
		const measure = (text: string) => text.length * 10;

		expect(fitEdgeLabel('abcdefgh', 50, measure)).toBe('abcd…');
		expect(fitEdgeLabel('abc', 50, measure)).toBe('abc');
		expect(fitEdgeLabel('abcdef', 20, measure)).toBeUndefined();
	});
});
