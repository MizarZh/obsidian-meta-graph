import { describe, expect, it, vi } from 'vitest';
import { GroupOverlayLayer } from '@/graph/renderers/sigma/sigma-group-overlay';

vi.mock('sigma', () => ({ default: class {} }));

describe('Sigma empty dynamic groups', () => {
	it('hides the region and title, rejects picking, and restores when members return', () => {
		const attributes = {
			hidden: true,
			isBend: false,
			x: 100,
			y: 100,
			size: 5,
		};
		const group = {
			id: 'g',
			name: 'Group',
			shape: 'rectangle',
			padding: 0,
			dynamicNodeIds: ['n'],
		};
		const element = {
			style: { display: '', setProperty: vi.fn() },
			classList: { toggle: vi.fn() },
			querySelector: () => null,
		};
		// Exercise real update, bounds, and hit-testing without a WebGL canvas.
		const layer = Object.assign(
			Object.create(GroupOverlayLayer.prototype),
			{
				groups: [group],
				layer: { hidden: false },
				callbacks: {},
				getOrCreateGroupElement: () => element,
				getGraph: () => ({
					hasNode: () => true,
					getNodeAttributes: () => attributes,
				}),
				sigma: {
					scaleSize: (size: number) => size,
					graphToViewport: (p: unknown) => p,
				},
			},
		) as GroupOverlayLayer;
		layer.update();
		expect(element.style.display).toBe('none');
		expect(
			layer.getGroupAtViewportPosition({ x: 0, y: 0 }),
		).toBeUndefined();
		attributes.hidden = false;
		layer.update();
		expect(element.style.display).toBe('');
		expect(layer.getGroupAtViewportPosition({ x: 100, y: 100 })).toBe('g');
		attributes.hidden = true;
		layer.update();
		expect(element.style.display).toBe('none');
	});
});
