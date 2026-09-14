import type { ChartStyleConfig, WorkspaceState } from '@/core/types';
import { getActiveChart } from '@/workspace/state/chart-selectors';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

/** Build test snapshots through the canonical chart-local style domain. */
export function withChartStyle<T extends Partial<WorkspaceState>>(
	state: T,
	style: Partial<ChartStyleConfig>,
): T & WorkspaceState {
	const base = { ...createWorkspaceState(200), ...state };
	const active = getActiveChart(base);
	return {
		...base,
		charts: base.charts.map((chart) =>
			chart.id === active.id
				? { ...chart, style: { ...chart.style, ...style } }
				: chart,
		),
	};
}
