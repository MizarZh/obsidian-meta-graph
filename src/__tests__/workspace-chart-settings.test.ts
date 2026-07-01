import { describe, expect, it } from 'vitest';
import type { MetaGraphChart, WorkspaceState } from '../core/types';
import {
	setArcSpacingInState,
	setCubeFaceOpacityInState,
	setFlowLaneSpacingInState,
	setFlowLayerSpacingInState,
	setFlowSpacingInState,
	setLabelDensityInState,
} from '../workspace/state/chart-settings';
import { createWorkspaceState } from '../workspace/state/workspace-state';
import { updateActiveChartState } from '../workspace/state/state-updaters';

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}

describe('workspace chart settings', () => {
	it('keeps no-op display updates referentially stable', () => {
		const state = createWorkspaceState(100, 1.5);

		expect(setLabelDensityInState(state, state.labelDensity)).toBe(state);
	});

	it('clamps display settings before writing them to the active chart', () => {
		const state = createWorkspaceState(100, 1.5);

		const denseState = setLabelDensityInState(state, 2);
		const opaqueState = setCubeFaceOpacityInState(state, 0);

		expect(denseState.labelDensity).toBe(1);
		expect(getActiveChart(denseState).display.labelDensity).toBe(1);
		expect(opaqueState.cubeFaceOpacity).toBe(0.05);
		expect(getActiveChart(opaqueState).display.cubeFaceOpacity).toBe(0.05);
	});

	it('preserves layout revision behavior for spacing settings', () => {
		const state = createWorkspaceState(100, 1.5);
		const flowState = {
			...state,
			activeChartId: 'learning-flow',
			mode: 'flow' as const,
		};
		const arcState = {
			...state,
			activeChartId: 'arc-diagram',
			mode: 'arc' as const,
		};

		expect(setFlowSpacingInState(flowState, 2).layoutRevision).toBe(1);
		expect(setFlowLayerSpacingInState(flowState, 2).layoutRevision).toBe(1);
		expect(setFlowLaneSpacingInState(flowState, 2).layoutRevision).toBe(1);
		expect(setArcSpacingInState(arcState, 2).layoutRevision).toBe(1);
	});

	it('preserves graph force settings when a non-force chart becomes active', () => {
		const state = createWorkspaceState(100, 1.5);
		const flowChart = state.charts.find(
			(chart) => chart.id === 'learning-flow',
		);
		if (!flowChart) {
			throw new Error('Flow chart is missing.');
		}
		const graphState = {
			...state,
			graphCenterForce: 9,
			graphRepelForce: 8,
		};

		const nextState = updateActiveChartState(graphState, flowChart);

		expect(nextState.mode).toBe('flow');
		expect(nextState.graphCenterForce).toBe(9);
		expect(nextState.graphRepelForce).toBe(8);
	});

	it('reads graph force settings from a force chart when it becomes active', () => {
		const state = createWorkspaceState(100, 1.5);
		const graphChart = getActiveChart(state);

		const nextState = updateActiveChartState(state, {
			...graphChart,
			layout: {
				...graphChart.layout,
				centerForce: 7,
				repelForce: 6,
			},
		});

		expect(nextState.graphCenterForce).toBe(7);
		expect(nextState.graphRepelForce).toBe(6);
	});
});
