import { describe, expect, it } from 'vitest';
import type { ViewMode } from '@/core/types';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	getActiveChart,
	getActiveChartStyle,
} from '@/workspace/state/chart-selectors';
import { setNodeStyleOverridesInState } from '@/workspace/state/style-state';
import { setLabelSizeInState } from '@/workspace/state/chart-settings';
import {
	duplicateActiveChartInState,
	setActiveChartInState,
	setActiveChartTypeInState,
} from '@/workspace/state/chart-state';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	serializeMetaGraphState,
	normalizeMetaGraphDocument,
} from '@/workspace/meta-graph-model';

const modes: ViewMode[] = [
	'graph',
	'free',
	'flow',
	'arc',
	'hierarchical-edge-bundling',
	'graph-3d',
	'cube',
];
describe('canonical chart-local style', () => {
	it.each(modes)(
		'updates only chart style in %s without rebuilding or relayout',
		(mode) => {
			const state = setActiveChartTypeInState(
				createWorkspaceState(200),
				mode,
			).state;
			const chart = getActiveChart(state);
			const input = { color: '#ff0000' };
			const next = setNodeStyleOverridesInState(state, input);
			input.color = '#00ff00';
			const nextChart = getActiveChart(next);
			expect(getActiveChartStyle(next)).toBe(nextChart.style);
			expect(nextChart.style.nodeOverrides.color).toBe('#ff0000');
			expect(nextChart.style).not.toBe(chart.style);
			expect(chart.style.nodeOverrides.color).not.toBe('#ff0000');
			for (const key of [
				'layout',
				'grouping',
				'query',
				'display',
				'curated',
			] as const)
				expect(nextChart[key]).toBe(chart[key]);
			for (const key of [
				'grouping',
				'manualLayout',
				'query',
				'projection',
				'globalNodeStyleRules',
				'globalLinkStyleRules',
			] as const)
				expect(next[key]).toBe(state[key]);
			for (const other of state.charts.filter(
				(c) => c.id !== state.activeChartId,
			))
				expect(next.charts.find((c) => c.id === other.id)).toBe(other);
			expect(
				analyzeWorkspaceStateChanges(
					next,
					state,
					createWorkspaceRenderBaseline(state),
				),
			).toMatchObject({
				styleRulesChanged: true,
				shouldRebuild: false,
				forceLayout: false,
			});
			for (const key of [
				'nodeStyleOverrides',
				'unresolvedNodeStyleOverrides',
				'linkStyleOverrides',
				'plainLinkStyleOverrides',
				'unresolvedLinkStyleOverrides',
				'nodeStyleRules',
				'linkStyleRules',
			])
				expect(next).not.toHaveProperty(key);
		},
	);
	it('retains canonical style references during unrelated display updates', () => {
		const state = createWorkspaceState(200);
		const next = setLabelSizeInState(state, state.labelSize + 1);
		expect(getActiveChartStyle(next)).toBe(getActiveChartStyle(state));
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			).styleRulesChanged,
		).toBe(false);
	});
	it('isolates copied charts, follows chart switches and survives persistence', () => {
		const original = setNodeStyleOverridesInState(
			createWorkspaceState(200),
			{ color: '#ff0000' },
		);
		const duplicate = duplicateActiveChartInState(original).state;
		expect(getActiveChartStyle(duplicate)).toEqual(
			getActiveChartStyle(original),
		);
		expect(getActiveChartStyle(duplicate)).not.toBe(
			getActiveChartStyle(original),
		);
		const changed = setNodeStyleOverridesInState(duplicate, {
			color: '#00ff00',
		});
		const switched = setActiveChartInState(
			changed,
			original.activeChartId,
		).state;
		expect(getActiveChartStyle(switched).nodeOverrides.color).toBe(
			'#ff0000',
		);
		const restored = createWorkspaceState(
			200,
			1.5,
			normalizeMetaGraphDocument(
				serializeMetaGraphState(switched),
				200,
				1.5,
			),
		);
		expect(getActiveChartStyle(restored).nodeOverrides.color).toBe(
			'#ff0000',
		);
		expect(
			getActiveChartStyle(
				setActiveChartInState(restored, changed.activeChartId).state,
			).nodeOverrides.color,
		).toBe('#00ff00');
	});
});
