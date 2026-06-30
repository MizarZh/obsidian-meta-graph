import { describe, expect, it } from 'vitest';
import type { ChartLayoutConfig } from '../core/types';
import { normalizeCubeLayout } from '../workspace/state/manual-layout';

describe('normalizeCubeLayout', () => {
	it('keeps manual placements at cube face edges', () => {
		const layout: ChartLayoutConfig = {
			engine: 'cube-3d',
			spacing: 1,
			manual: {
				nodes: {
					'A.md': { x: 1, y: -1, groupId: 'cube-front' },
				},
				groups: [],
			},
		};

		const normalized = normalizeCubeLayout(layout, ['A.md']);

		expect(normalized.manual?.nodes['A.md']).toEqual({
			x: 1,
			y: -1,
			groupId: 'cube-front',
		});
	});

	it('clamps out-of-bounds manual placements instead of re-placing them', () => {
		const layout: ChartLayoutConfig = {
			engine: 'cube-3d',
			spacing: 1,
			manual: {
				nodes: {
					'A.md': { x: 1.2, y: -1.3, groupId: 'cube-front' },
				},
				groups: [],
			},
		};

		const normalized = normalizeCubeLayout(layout, ['A.md']);

		expect(normalized.manual?.nodes['A.md']?.x).toBeCloseTo(1);
		expect(normalized.manual?.nodes['A.md']?.y).toBeCloseTo(-1);
		expect(normalized.manual?.nodes['A.md']?.groupId).toBe('cube-front');
	});
});
