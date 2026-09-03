import { describe, expect, it } from 'vitest';
import { isGraphPointInLayoutGroup } from '../layouts/group-geometry';

describe('layout group hit testing', () => {
	it('hits Flow regions and Arc bands', () => {
		expect(
			isGraphPointInLayoutGroup(
				{
					kind: 'flow-container',
					groupId: 'flow',
					name: 'Flow',
					color: '#ffffff',
					nodeIds: [],
					x: 10,
					y: 20,
					width: 30,
					height: 40,
				},
				{ x: 25, y: 30 },
			),
		).toBe(true);
		expect(
			isGraphPointInLayoutGroup(
				{
					kind: 'arc-band',
					groupId: 'arc',
					name: 'Arc',
					color: '#ffffff',
					nodeIds: [],
					direction: 'right',
					start: -10,
					end: 10,
					halfWidth: 20,
				},
				{ x: 15, y: 0 },
			),
		).toBe(true);
	});

	it('hits HEB sectors but not halo-only geometry', () => {
		expect(
			isGraphPointInLayoutGroup(
				{
					kind: 'radial-sector',
					groupId: 'heb',
					name: 'HEB',
					color: '#ffffff',
					nodeIds: [],
					startAngle: 0,
					endAngle: Math.PI / 2,
					innerRadius: 10,
					outerRadius: 30,
				},
				{ x: 15, y: 15 },
			),
		).toBe(true);
		expect(
			isGraphPointInLayoutGroup(
				{
					kind: 'member-halos',
					groupId: 'halos',
					name: 'Halos',
					color: '#ffffff',
					nodeIds: ['A.md'],
				},
				{ x: 0, y: 0 },
			),
		).toBe(false);
	});
});
