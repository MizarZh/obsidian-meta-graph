import { describe, expect, it, vi } from 'vitest';
import { SigmaRenderer } from '@/graph/renderers/sigma/sigma-renderer';
vi.mock('sigma', () => ({ default: class {} }));
vi.hoisted(() => {
	vi.stubGlobal('WebGL2RenderingContext', class {});
	vi.stubGlobal('WebGLRenderingContext', class {});
});

describe('Sigma anchored zoom', () => {
	it('keeps the anchor screen offset stable while changing camera center and ratio', () => {
		const camera = { x: 0.5, y: 0.5, ratio: 1, setState: vi.fn() };
		const renderer = Object.assign(Object.create(SigmaRenderer.prototype), {
			instance: { getCamera: () => camera, graphToViewport: (p: unknown) => p, viewportToFramedGraph: (p: unknown) => p },
		}) as SigmaRenderer;
		const anchor = { x: 0.8, y: 0.2 };
		renderer.setZoomLevel(200, anchor);
		const next = camera.setState.mock.calls[0]![0] as {x: number; y: number; ratio: number};
		expect(next.ratio).toBe(0.5);
		expect((anchor.x - next.x) / next.ratio).toBeCloseTo((anchor.x - camera.x) / camera.ratio);
		expect((anchor.y - next.y) / next.ratio).toBeCloseTo((anchor.y - camera.y) / camera.ratio);
		renderer.setZoomLevel(100);
		expect(camera.setState).toHaveBeenLastCalledWith({ratio: 1});
	});
});
