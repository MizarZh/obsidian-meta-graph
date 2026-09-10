import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashString } from '@/core/hash';
import { createRuleId } from '@/core/rule-id';
import { setsEqual } from '@/core/sets';
import { getActiveChart } from '@/workspace/state/chart-selectors';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { createDefaultFilterRoot } from '@/ui/filter/filter-tree';
import { createCuratedConditionDraft } from '@/ui/curated/curated-panel-state';

afterEach(() => vi.restoreAllMocks());

describe('shared pure helpers', () => {
	it.each([
		['', 2166136261],
		['a', 3826002220],
		['hello', 1335831723],
	] as const)('preserves the layout hash for %s', (value, expected) => {
		expect(hashString(value)).toBe(expected / 0xffffffff);
	});

	it('compares set membership independently of iteration order', () => {
		expect(setsEqual(new Set(), new Set())).toBe(true);
		expect(setsEqual(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
		expect(setsEqual(new Set(['a']), new Set(['b']))).toBe(false);
		expect(setsEqual(new Set(['a']), new Set(['a', 'b']))).toBe(false);
		const shared = {};
		expect(setsEqual(new Set([shared]), new Set([shared]))).toBe(true);
		expect(setsEqual(new Set([shared]), new Set([{}]))).toBe(false);
	});

	it('preserves rule ID formatting', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1234);
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		expect(createRuleId()).toBe(`1234-${(0.5).toString(36).slice(2)}`);
	});

	it('selects the chart by ID and retains the missing-chart error', () => {
		const state = createWorkspaceState(200);
		const chart = getActiveChart(state);
		const second = { ...chart, id: 'second' };
		state.charts = [chart, second];
		state.activeChartId = second.id;
		expect(getActiveChart(state)).toBe(second);
		state.activeChartId = 'missing';
		expect(() => getActiveChart(state)).toThrow(
			'Active chart is missing from workspace state.',
		);
	});

	it('creates independent default filter trees for panels and condition drafts', () => {
		const root = createDefaultFilterRoot();
		const draft = createCuratedConditionDraft();
		expect(draft.filterRoot).toEqual(root);
		expect(draft.filterRoot).not.toBe(root);
		expect(draft.filterRoot.children).not.toBe(root.children);
	});
});
