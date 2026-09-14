import type {
	ChartStyleConfig,
	MetaGraphChart,
	WorkspaceState,
} from '@/core/types';

export function getActiveChart(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}

/** Chart-local styles have one source; runtime consumers retain this reference. */
export function getActiveChartStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): ChartStyleConfig {
	return getActiveChart(state).style;
}
