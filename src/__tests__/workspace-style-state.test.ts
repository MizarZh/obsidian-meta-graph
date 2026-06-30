import { describe, expect, it } from 'vitest';
import type { MetaGraphChart, WorkspaceState } from '../core/types';
import {
	setDefaultNodeStyleInState,
	setGlobalNodeStyleRulesInState,
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
		const style = { color: '#123456', size: 9 };

		const nextState = setDefaultNodeStyleInState(state, style);
		style.color = '#abcdef';

		expect(nextState.defaultNodeStyle.color).toBe('#123456');
	});
});
