import { describe, expect, it } from 'vitest';
import { createBendNode } from '@/layouts/bend-node';
import {
	arcAxisPoint,
	arcOppositeVector,
	radialPoint,
} from '@/layouts/group-geometry';

describe('shared layout geometry', () => {
	it('keeps bend nodes transparent, fixed, unlabeled and independently mutable', () => {
		const bend = createBendNode(12, -34);
		expect(bend).toEqual({
			label: '',
			x: 12,
			y: -34,
			size: 0.01,
			color: 'rgba(0, 0, 0, 0)',
			path: '',
			folder: '',
			domains: [],
			tags: [],
			fixed: true,
			isBend: true,
		});
		bend.tags.push('changed');
		expect(createBendNode(12, -34).tags).toEqual([]);
	});

	it.each([
		['right', { x: 0, y: 7 }, { x: -1, y: 0 }],
		['left', { x: 0, y: 7 }, { x: 1, y: 0 }],
		['up', { x: 7, y: 0 }, { x: 0, y: -1 }],
		['down', { x: 7, y: 0 }, { x: 0, y: 1 }],
	] as const)(
		'preserves the shared %s Arc orientation',
		(direction, axis, outward) => {
			expect(arcAxisPoint(direction, 7)).toEqual(axis);
			expect(arcOppositeVector(direction)).toEqual(outward);
		},
	);

	it('keeps radial zero at the top and positive angles clockwise', () => {
		const top = radialPoint(0, 10);
		expect(top.x).toBeCloseTo(0);
		expect(top.y).toBe(-10);
		expect(radialPoint(Math.PI / 2, 10)).toEqual({ x: 10, y: 0 });
	});
});
