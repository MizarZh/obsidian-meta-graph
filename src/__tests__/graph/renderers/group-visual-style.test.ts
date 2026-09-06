import { describe, expect, it } from 'vitest';
import {
	GROUP_FOCUS_MUTED_OPACITY,
	resolveGroupHaloVisualStyle,
	resolveGroupRegionVisualStyle,
} from '../../../graph/renderers/group-visual-style';

describe('Group visual styles', () => {
	it('uses one region state table for Sigma and G6', () => {
		expect(resolveGroupRegionVisualStyle({})).toEqual({
			fillOpacity: 0.06,
			strokeOpacity: 0.55,
			lineWidth: 1.5,
			opacity: 1,
		});
		expect(resolveGroupRegionVisualStyle({ hovered: true })).toMatchObject({
			fillOpacity: 0.08,
			strokeOpacity: 0.8,
			lineWidth: 1.75,
		});
		expect(resolveGroupRegionVisualStyle({ selected: true })).toMatchObject(
			{
				fillOpacity: 0.12,
				strokeOpacity: 0.9,
				lineWidth: 2,
			},
		);
	});

	it('uses the same halo and focus values in both renderers', () => {
		expect(resolveGroupHaloVisualStyle({})).toEqual({
			strokeOpacity: 0.65,
			lineWidth: 1.5,
			opacity: 1,
		});
		expect(resolveGroupHaloVisualStyle({ hovered: true })).toMatchObject({
			strokeOpacity: 0.85,
			lineWidth: 2,
		});
		expect(
			resolveGroupHaloVisualStyle({ selected: true, muted: true }),
		).toEqual({
			strokeOpacity: 1,
			lineWidth: 2.5,
			opacity: GROUP_FOCUS_MUTED_OPACITY,
		});
	});
});
