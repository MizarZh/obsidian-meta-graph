import { describe, expect, it, vi } from 'vitest';
import { createCanvasResizeHandler } from '@/ui/workspace/canvas-resize';

describe('Workspace file tab resize', () => {
	it('restores a renderer resized while hidden, even when the tab returns to its previous size', () => {
		let rendererSize = { width: 800, height: 600 };
		const resize = vi.fn(() => {
			rendererSize = { width: 800, height: 600 };
		});
		const observe = createCanvasResizeHandler(resize);
		observe({ width: 800, height: 600 });
		observe({ width: 0, height: 0 });
		rendererSize = { width: 1, height: 1 };
		expect(resize).toHaveBeenCalledTimes(1);
		observe({ width: 800, height: 600 });
		expect(resize).toHaveBeenCalledTimes(2);
		expect(rendererSize).toEqual({ width: 800, height: 600 });
		observe({ width: 800, height: 600 });
		expect(resize).toHaveBeenCalledTimes(2);
	});
	it('ignores empty notifications and never resizes zero-area canvases', () => {
		const resize = vi.fn();
		const observe = createCanvasResizeHandler(resize);
		observe();
		observe({ width: 0, height: 0 });
		observe({ width: 800, height: 0 });
		expect(resize).not.toHaveBeenCalled();
		observe({ width: 800, height: 600 });
		observe({ width: 900, height: 600 });
		expect(resize).toHaveBeenCalledTimes(2);
	});
});
