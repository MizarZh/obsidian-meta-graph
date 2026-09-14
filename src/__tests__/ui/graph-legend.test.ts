import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import { describe, expect, it } from 'vitest';
import { buildGraphLegend } from '@/ui/workspace/graph-legend';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	createLinkStyleRule,
	createNodeStyleRule,
} from '@/ui/filter/filter-style-rules';

describe('graph legend', () => {
	it('reflects current chart overrides without changing workspace defaults', () => {
		const state = createWorkspaceState(200, 1.5);
		getActiveChartStyle(state).nodeOverrides = {
			shape: 'diamond',
			color: '#123456',
		};
		getActiveChartStyle(state).linkOverrides = {
			lineStyle: 'dashed',
			size: 3,
		};
		const legend = buildGraphLegend(state);
		expect(legend.nodes[0]?.node).toMatchObject({
			shape: 'diamond',
			color: '#123456',
		});
		expect(legend.links[0]?.line).toMatchObject({
			lineStyle: 'dashed',
			size: 3,
		});
		expect(state.defaultNodeStyle.shape).toBe('circle');
	});
	it('uses custom names or readable conditions and preserves repeated names across scopes', () => {
		const state = createWorkspaceState(200, 1.5);
		state.globalNodeStyleRules = [
			{
				...createNodeStyleRule('n'),
				field: 'file.tags',
				operator: 'contains',
				value: 'finance',
			},
		];
		state.globalLinkStyleRules = [
			{
				...createLinkStyleRule('a'),
				name: 'Prerequisite',
				field: 'source-field',
				operator: 'is',
				value: 'prerequisite',
			},
		];
		getActiveChartStyle(state).linkRules = [
			{
				...createLinkStyleRule('a'),
				name: 'Prerequisite',
				field: 'source-field',
				operator: 'is-not',
				value: 'related',
				hidden: true,
			},
		];
		const legend = buildGraphLegend(state);
		expect(legend.nodes[1]?.name).toBe('Tags contains finance');
		expect(legend.links.slice(1).map((entry) => entry.name)).toEqual([
			'Prerequisite',
			'Prerequisite',
		]);
		expect(legend.links[1]?.id).not.toBe(legend.links[2]?.id);
		expect(legend.links[2]?.condition).toBe('Source field is not related');
		expect(legend.links[2]?.line?.hidden).toBe(true);
		state.globalLinkStyleRules[0]!.name = '';
		expect(buildGraphLegend(state).links[1]?.name).toBe(
			'Source field is prerequisite',
		);
	});
	it('does not discard false and zero style overrides', () => {
		const state = createWorkspaceState(200, 1.5);
		getActiveChartStyle(state).linkOverrides = {
			opacity: 0,
			hidden: false,
			color: undefined,
		};
		const entry = buildGraphLegend(state).links[0]!;
		expect(entry.line).toMatchObject({
			opacity: 0,
			hidden: false,
			color: state.defaultLinkStyle.color,
		});
	});
});
