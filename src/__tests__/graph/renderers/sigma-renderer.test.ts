import { describe, expect, it, vi } from 'vitest';
import Graphology from 'graphology';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { calculateLabelOpacity } from '@/graph/renderers/sigma/label-opacity';
import type { SigmaRenderer as SigmaRendererType } from '@/graph/renderers/sigma/sigma-renderer';

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
	it('holds spacing bounds through repeated rebuilds and releases them on fit', async () => {
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
		const { SigmaRenderer } =
			await import('@/graph/renderers/sigma/sigma-renderer');
		const renderer = Object.create(
			SigmaRenderer.prototype,
		) as SigmaRendererType;
		const originalBounds = { x: [0, 100], y: [0, 100] };
		let bounds: typeof originalBounds | null = null;
		const animatedReset = vi.fn();
		const getBBox = vi.fn(() => originalBounds);
		Object.assign(renderer, {
			instance: {
				getBBox,
				getCustomBBox: () => bounds,
				setCustomBBox: (value: typeof bounds) => {
					bounds = value;
				},
				setGraph: vi.fn(),
				getCamera: () => ({ animatedReset }),
			},
			updateHoveredNeighborhood: vi.fn(),
			syncGroupFocus: vi.fn(),
			hoverRefreshCoordinator: { synchronize: vi.fn() },
			parallelEdgeLayer: { invalidate: vi.fn() },
			groupOverlayLayer: { update: vi.fn() },
		});
		for (const span of [200, 400]) {
			const graph = new Graphology() as RuntimeGraph;
			renderer.clearHeldBounds();
			renderer.setGraph(graph, { preserveViewportScale: true });
			expect(bounds).toEqual(originalBounds);
			getBBox.mockReturnValue({ x: [0, span], y: [0, span] });
		}
		expect(getBBox).toHaveBeenCalledOnce();
		renderer.fit();
		expect(bounds).toBeNull();
		expect(animatedReset).toHaveBeenCalledOnce();
	});

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
		const sigmaRendererModule: typeof import('@/graph/renderers/sigma/sigma-renderer') =
			await import('@/graph/renderers/sigma/sigma-renderer');
		const SigmaRenderer = sigmaRendererModule.SigmaRenderer;
		const refresh = vi.fn();
		const update = vi.fn();
		const renderer = Object.create(
			SigmaRenderer.prototype,
		) as SigmaRendererType;
		Object.assign(renderer, {
			instance: { refresh },
			parallelEdgeLayer: { update },
			hoverRefreshCoordinator: { synchronize: vi.fn() },
			groupOverlayLayer: { setFocusedNode: vi.fn() },
			layoutGroupLayer: { setFocusedNode: vi.fn() },
		});

		renderer.refresh();

		expect(refresh).toHaveBeenCalledOnce();
		expect(update).not.toHaveBeenCalled();
	});
});
