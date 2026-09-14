import type { WorkspaceState } from '@/core/types';
import type { GraphForceSettings } from '@/layouts/force-layout';

export function getWorkspaceGraphForceSettings(
	state: Pick<
		WorkspaceState,
		| 'graphCenterForce'
		| 'graphRepelForce'
		| 'graphLinkForce'
		| 'graphDragLinkForce'
		| 'graphReturnForce'
		| 'graphLinkDistance'
	>,
): GraphForceSettings {
	return {
		centerForce: state.graphCenterForce,
		repelForce: state.graphRepelForce,
		linkForce: state.graphLinkForce,
		dragLinkForce: state.graphDragLinkForce,
		returnForce: state.graphReturnForce,
		linkDistance: state.graphLinkDistance,
	};
}

export function isStableNetworkEnabled(state: WorkspaceState): boolean {
	return (
		state.mode === 'graph' &&
		state.charts.find((chart) => chart.id === state.activeChartId)?.layout
			.stableLayout === true
	);
}
