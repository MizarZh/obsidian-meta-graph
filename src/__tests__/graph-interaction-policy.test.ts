import { describe, expect, it } from 'vitest';
import {
	getNextNodeOpenSuppressUntil,
	getSigmaDragAction,
	getSigmaDragEndAction,
	shouldOpenNode,
} from '../ui/graph-interaction-policy';

describe('graph interaction policy', () => {
	it('maps free drag capability to manual drag actions', () => {
		expect(getSigmaDragAction({ supportsFreeNodeDrag: true })).toEqual({
			kind: 'manual-position',
		});
		expect(getSigmaDragEndAction({ supportsFreeNodeDrag: true })).toEqual({
			kind: 'commit-manual-position',
		});
	});

	it('maps non-free drag to force simulation actions', () => {
		expect(getSigmaDragAction({ supportsFreeNodeDrag: false })).toEqual({
			kind: 'force-simulation',
		});
		expect(getSigmaDragEndAction({ supportsFreeNodeDrag: false })).toEqual({
			kind: 'release-force-simulation',
		});
	});

	it('handles node open suppression window', () => {
		expect(shouldOpenNode(1000, 999)).toBe(true);
		expect(shouldOpenNode(1000, 1001)).toBe(false);
		expect(getNextNodeOpenSuppressUntil(1000)).toBe(1700);
		expect(getNextNodeOpenSuppressUntil(1000, 250)).toBe(1250);
	});
});
