import { describe, expect, it } from 'vitest';
import {
	getNextNodeOpenSuppressUntil,
	getPlanarDragAction,
	getPlanarDragEndAction,
	shouldOpenNode,
} from '../../ui/interactions/graph-interaction-policy';

describe('graph interaction policy', () => {
	it('maps free drag capability to manual drag actions', () => {
		expect(getPlanarDragAction({ supportsFreeNodeDrag: true })).toEqual({
			kind: 'manual-position',
		});
		expect(getPlanarDragEndAction({ supportsFreeNodeDrag: true })).toEqual({
			kind: 'commit-manual-position',
		});
	});

	it('maps non-free drag to force simulation actions', () => {
		expect(getPlanarDragAction({ supportsFreeNodeDrag: false })).toEqual({
			kind: 'force-simulation',
		});
		expect(getPlanarDragEndAction({ supportsFreeNodeDrag: false })).toEqual(
			{
				kind: 'release-force-simulation',
			},
		);
	});

	it('handles node open suppression window', () => {
		expect(shouldOpenNode(1000, 999)).toBe(true);
		expect(shouldOpenNode(1000, 1001)).toBe(false);
		expect(getNextNodeOpenSuppressUntil(1000)).toBe(1700);
		expect(getNextNodeOpenSuppressUntil(1000, 250)).toBe(1250);
	});
});
