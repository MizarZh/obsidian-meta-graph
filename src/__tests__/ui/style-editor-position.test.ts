import { describe, expect, it } from 'vitest';
import {
	placeStyleEditor,
	placeStyleEditorInWorkspace,
} from '@/ui/filter/style-editor-position';

describe('floating style editor placement', () => {
	it.each([1, 1.25, 0.8])(
		'keeps an 8px local gap in an offset workspace at scale %s',
		(scale) => {
			const result = placeStyleEditorInWorkspace(
				{
					left: 400 + 20 * scale,
					right: 400 + 540 * scale,
					top: 80 + 50 * scale,
				},
				{
					left: 400,
					top: 80,
					width: 1500 * scale,
					height: 900 * scale,
				},
				1500,
				900,
			);
			expect(result.left).toBeCloseTo(548);
			expect(result.top).toBeCloseTo(50);
			expect(result.width).toBe(440);
		},
	);
	it('opens to the right of the panel at a stable top', () => {
		expect(
			placeStyleEditor({ left: 20, right: 540, top: 50 }, 1500, 900),
		).toEqual({ left: 548, top: 50, width: 440, height: 640 });
	});
	it('flips left when the right side has no room', () => {
		expect(
			placeStyleEditor({ left: 800, right: 1320, top: 50 }, 1400, 900)
				.left,
		).toBe(352);
	});
	it('stays inside narrow and short windows', () => {
		const result = placeStyleEditor(
			{ left: 20, right: 300, top: 400 },
			360,
			480,
		);
		expect(result).toEqual({ left: 12, top: 228, width: 336, height: 240 });
	});
	it('aligns to a lower card instead of the panel top', () => {
		expect(
			placeStyleEditor({ left: 30, right: 530, top: 350 }, 1500, 900),
		).toEqual({ left: 538, top: 350, width: 440, height: 538 });
	});
});
