import type { MetaGraphChart, ViewMode, WorkspaceState } from '../core/types';
import { cloneSerializable } from './workspace-persistence';

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
		mode: nextChart.type,
		chartSource: nextChart.source,
		flowEdgeStyle: nextChart.layout.edgeStyle ?? 'orthogonal',
		flowDirection: nextChart.layout.direction ?? 'LR',
		arcDirection: nextChart.layout.arcDirection ?? 'right',
		fadeDistance: nextChart.display.fadeDistance,
		labelSize: nextChart.display.labelSize,
		labelPosition: nextChart.display.labelPosition,
		labelColor: nextChart.display.labelColor,
		labelBackgroundOpacity: nextChart.display.labelBackgroundOpacity,
		labelDensity: nextChart.display.labelDensity,
		cubeFaceOpacity: nextChart.display.cubeFaceOpacity,
		forceLabels: nextChart.display.forceLabels,
		enableForceLayout: nextChart.display.enableForceLayout,
		graphSpacing: isForceGraphType(nextChart.type)
			? nextChart.layout.spacing
			: state.graphSpacing,
		graphCenterForce:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.centerForce !== undefined
				? nextChart.layout.centerForce
				: state.graphCenterForce,
		graphRepelForce:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.repelForce !== undefined
				? nextChart.layout.repelForce
				: state.graphRepelForce,
		graphLinkForce:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.linkForce !== undefined
				? nextChart.layout.linkForce
				: state.graphLinkForce,
		graphDragLinkForce:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.dragLinkForce !== undefined
				? nextChart.layout.dragLinkForce
				: state.graphDragLinkForce,
		graphReturnForce:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.returnForce !== undefined
				? nextChart.layout.returnForce
				: state.graphReturnForce,
		graphLinkDistance:
			isForceGraphType(nextChart.type) &&
			nextChart.layout.linkDistance !== undefined
				? nextChart.layout.linkDistance
				: state.graphLinkDistance,
		flowSpacing:
			nextChart.type === 'flow' ? nextChart.layout.spacing : state.flowSpacing,
		arcSpacing:
			nextChart.type === 'arc' ? nextChart.layout.spacing : state.arcSpacing,
		manualLayout: cloneSerializable(
			nextChart.layout.manual ?? { nodes: {}, groups: [] },
		),
		query: cloneSerializable(nextChart.query),
		curated: cloneSerializable(nextChart.curated),
		nodeStyleOverrides: cloneSerializable(nextChart.style.nodeOverrides),
		linkStyleOverrides: cloneSerializable(nextChart.style.linkOverrides),
		nodeStyleRules: cloneSerializable(nextChart.style.nodeRules),
		linkStyleRules: cloneSerializable(nextChart.style.linkRules),
		layoutRevision: state.layoutRevision + (forceLayout ? 1 : 0),
	};
}

function isForceGraphType(type: ViewMode): boolean {
	return type === 'graph' || type === 'graph-3d' || type === 'cube';
}
