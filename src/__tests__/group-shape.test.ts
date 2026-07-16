import { describe, expect, it } from 'vitest';
import {
	canMoveGroup,
	fitViewportCircle,
	isViewportPointInGroup,
	normalizeGroupFrameForShape,
	resolveGroupShape,
} from '../layouts/group-shape';

describe('group shapes', () => {
	it('uses circles for Graph and rectangles elsewhere by default', () => {
		expect(resolveGroupShape('graph', 'auto')).toBe('circle');
		expect(resolveGroupShape('free', undefined)).toBe('rectangle');
		expect(resolveGroupShape('graph', 'rectangle')).toBe('rectangle');
	});

	it('allows Graph group movement only while Force layout is enabled', () => {
		expect(canMoveGroup('graph', false)).toBe(false);
		expect(canMoveGroup('graph', true)).toBe(true);
		expect(canMoveGroup('free', false)).toBe(true);
	});

	it('normalizes circle frames around their existing center', () => {
		expect(
			normalizeGroupFrameForShape(
				{ x: 1, y: 2, width: 4, height: 2 },
				'circle',
			),
		).toEqual({ x: 1, y: 1, width: 4, height: 4 });
	});

	it('fits a circle around member radii and rejects corner drops', () => {
		const rect = fitViewportCircle(
			[
				{ x: 10, y: 10, radius: 2 },
				{ x: 30, y: 10, radius: 2 },
			],
			4,
		);

		expect(rect.width).toBe(rect.height);
		expect(rect.width).toBe(32);
		expect(isViewportPointInGroup({ x: 10, y: 10 }, rect, 'circle')).toBe(
			true,
		);
		expect(
			isViewportPointInGroup(
				{ x: rect.left, y: rect.top },
				rect,
				'circle',
			),
		).toBe(false);
	});
});
