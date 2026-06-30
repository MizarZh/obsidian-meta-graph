import type { MetaGraphChart, WorkspaceState } from '../../core/types';
import { createUpdatedActiveChartStateFields } from './active-chart-state';
import { cloneSerializable } from './persistence';

export function updateActiveChartState(
	state: WorkspaceState,
	patch: Partial<MetaGraphChart>,
	forceLayout = false,
): WorkspaceState {
	const activeChart = state.charts.find((item) => item.id === state.activeChartId);
	if (!activeChart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	const nextChart = cloneSerializable({
		...activeChart,
		...patch,
		query: patch.query ?? activeChart.query,
		layout: patch.layout ?? activeChart.layout,
		display: patch.display ?? activeChart.display,
		style: patch.style ?? activeChart.style,
	});
	return {
		...state,
		charts: state.charts.map((chart) =>
			chart.id === nextChart.id ? nextChart : chart,
		),
		...createUpdatedActiveChartStateFields(nextChart, state),
		layoutRevision: state.layoutRevision + (forceLayout ? 1 : 0),
	};
}
