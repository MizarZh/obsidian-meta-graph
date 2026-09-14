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

export function getFlowLayout(
	state: WorkspaceState,
): import('@/core/types').FlowLayoutKind {
	return state.mode === 'flow' &&
		state.charts.find((chart) => chart.id === state.activeChartId)?.layout
			.flowLayout === 'elk-interactive'
		? 'elk-interactive'
		: 'elk';
}

export function getNetworkLayout(
	state: WorkspaceState,
): import('@/core/types').NetworkLayoutKind {
	return state.mode === 'graph' &&
		state.charts.find((chart) => chart.id === state.activeChartId)?.layout
			.networkLayout === 'multilevel-stress'
		? 'multilevel-stress'
		: 'force-atlas';
}

export function isStableNetworkEnabled(state: WorkspaceState): boolean {
	return (
		state.mode === 'graph' &&
		state.charts.find((chart) => chart.id === state.activeChartId)?.layout
			.stableLayout === true
	);
}
