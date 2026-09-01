import { describe, expect, it } from 'vitest';
import type { MetaGraphChart, WorkspaceState } from '../core/types';
import {
	setDefaultNodeStyleInState,
	setGlobalNodeStyleRulesInState,
	setGlobalLinkStyleRulesInState,
	setLinkStyleRulesInState,
	moveNodeStyleRuleToScopeInState,
	moveLinkStyleRuleToScopeInState,
	setNodeStyleRulesInState,
} from '../workspace/state/style-state';
import { createWorkspaceState } from '../workspace/state/workspace-state';

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}

describe('workspace style state', () => {
	it('writes normalized style rules to state and active chart style', () => {
		const state = createWorkspaceState(100, 1.5);
		const nextState = setNodeStyleRulesInState(state, [
			{
				id: 'base',
				field: 'all',
				value: '',
				color: '#111111',
				size: 10,
			},
			{
				id: 'tag-rule',
				field: 'tag',
				operator: 'contains',
				value: '#project',
				color: '#ff0000',
				size: 14,
			},
		]);

		expect(nextState.nodeStyleRules).toEqual([
			{
				id: 'tag-rule',
				field: 'tag',
				operator: 'contains',
				value: '#project',
				color: '#ff0000',
				size: 14,
			},
		]);
		expect(getActiveChart(nextState).style.nodeRules).toEqual(
			nextState.nodeStyleRules,
		);
	});

	it('updates global style state without changing active chart style', () => {
		const state = createWorkspaceState(100, 1.5);

		const nextState = setGlobalNodeStyleRulesInState(state, [
			{
				id: 'global-tag-rule',
				field: 'tag',
				operator: 'contains',
				value: '#project',
				color: '#00ff00',
				size: 12,
			},
		]);

		expect(nextState.globalNodeStyleRules).toHaveLength(1);
		expect(getActiveChart(nextState).style.nodeRules).toEqual(
			getActiveChart(state).style.nodeRules,
		);
	});

	it('clones default style updates', () => {
		const state = createWorkspaceState(100, 1.5);
		const style = {
			color: '#123456',
			size: 9,
			opacity: 1,
			shape: 'circle' as const,
		};

		const nextState = setDefaultNodeStyleInState(state, style);
		style.color = '#abcdef';

		expect(nextState.defaultNodeStyle.color).toBe('#123456');
	});

	it('moves note rules between global and chart scopes', () => {
		const state = createWorkspaceState(100, 1.5);
		const globalRule = {
			id: 'global-tag-rule',
			field: 'tag' as const,
			operator: 'contains' as const,
			value: '#project',
			color: '#00ff00',
			size: 12,
		};
		const chartRule = {
			id: 'chart-folder-rule',
			field: 'folder' as const,
			operator: 'is' as const,
			value: 'Notes',
			color: '#ff0000',
			size: 9,
		};
		const withRules = setNodeStyleRulesInState(
			setGlobalNodeStyleRulesInState(state, [globalRule]),
			[chartRule],
		);

		const movedToChart = moveNodeStyleRuleToScopeInState(
			withRules,
			globalRule.id,
			'current',
		);
		expect(movedToChart.globalNodeStyleRules).toEqual([]);
		expect(movedToChart.nodeStyleRules).toEqual([chartRule, globalRule]);
		expect(getActiveChart(movedToChart).style.nodeRules).toEqual(
			movedToChart.nodeStyleRules,
		);

		const movedToGlobal = moveNodeStyleRuleToScopeInState(
			movedToChart,
			globalRule.id,
			'global',
		);
		expect(movedToGlobal.globalNodeStyleRules).toEqual([globalRule]);
		expect(movedToGlobal.nodeStyleRules).toEqual([chartRule]);
	});

	it('moves link rules between global and chart scopes', () => {
		const state = createWorkspaceState(100, 1.5);
		const globalRule = {
			id: 'global-link-rule',
			field: 'source-field' as const,
			operator: 'is' as const,
			value: 'leads-to',
			color: '#00ff00',
			size: 2,
			lineStyle: 'dashed' as const,
			label: 'Global',
			showLabel: true,
			hidden: false,
		};
		const withRules = setLinkStyleRulesInState(
			setGlobalLinkStyleRulesInState(state, [globalRule]),
			[],
		);
		const movedToChart = moveLinkStyleRuleToScopeInState(
			withRules,
			globalRule.id,
			'current',
		);
		expect(movedToChart.globalLinkStyleRules).toEqual([]);
		expect(movedToChart.linkStyleRules).toEqual([globalRule]);

		const movedToGlobal = moveLinkStyleRuleToScopeInState(
			movedToChart,
			globalRule.id,
			'global',
		);
		expect(movedToGlobal.globalLinkStyleRules).toEqual([globalRule]);
		expect(movedToGlobal.linkStyleRules).toEqual([]);
	});
});
