import { describe, expect, it, vi } from 'vitest';
import { calculateLabelOpacity } from '../graph/renderers/sigma/label-opacity';
import type { SigmaRenderer as SigmaRendererType } from '../graph/renderers/sigma/sigma-renderer';

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

describe('SigmaRenderer refresh', () => {
	it('lets the Sigma afterRender event own the parallel Canvas update', async () => {
		const WebGLContext = Object.assign(class {}, {
			BOOL: 0x8b56,
			BYTE: 0x1400,
			UNSIGNED_BYTE: 0x1401,
			SHORT: 0x1402,
			UNSIGNED_SHORT: 0x1403,
			INT: 0x1404,
			UNSIGNED_INT: 0x1405,
			FLOAT: 0x1406,
			TRIANGLES: 0x0004,
		});
		vi.stubGlobal('WebGLRenderingContext', WebGLContext);
		vi.stubGlobal('WebGL2RenderingContext', WebGLContext);
		const sigmaRendererModule: typeof import('../graph/renderers/sigma/sigma-renderer') =
			await import('../graph/renderers/sigma/sigma-renderer');
		const SigmaRenderer = sigmaRendererModule.SigmaRenderer;
		const refresh = vi.fn();
		const update = vi.fn();
		const renderer = Object.create(
			SigmaRenderer.prototype,
		) as SigmaRendererType;
		Object.assign(renderer, {
			instance: { refresh },
			parallelEdgeLayer: { update },
		});

		renderer.refresh();

		expect(refresh).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
	});
});
