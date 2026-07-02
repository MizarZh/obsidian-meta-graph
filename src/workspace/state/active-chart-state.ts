import type {
	MetaGraphChart,
	ViewMode,
	WorkspaceState,
} from '../../core/types';
import {
	DEFAULT_GRAPH_CENTER_FORCE,
	DEFAULT_GRAPH_DRAG_LINK_FORCE,
	DEFAULT_GRAPH_LINK_DISTANCE,
	DEFAULT_GRAPH_LINK_FORCE,
	DEFAULT_GRAPH_REPEL_FORCE,
	DEFAULT_GRAPH_RETURN_FORCE,
} from '../meta-graph-model';
import { cloneSerializable } from './persistence';

type ActiveChartStateFields = Pick<
	WorkspaceState,
	| 'mode'
	| 'chartSource'
	| 'flowEdgeStyle'
	| 'flowDirection'
	| 'arcDirection'
	| 'nodeSort'
	| 'nodeSortDirection'
	| 'fadeDistance'
	| 'labelSize'
	| 'labelPosition'
	| 'labelOffset'
	| 'labelColor'
	| 'labelLightTextColor'
	| 'labelLightBackgroundColor'
	| 'labelLightBackgroundOpacity'
	| 'labelDarkTextColor'
	| 'labelDarkBackgroundColor'
	| 'labelDarkBackgroundOpacity'
	| 'labelBackgroundOpacity'
	| 'labelDensity'
	| 'cubeFaceOpacity'
	| 'forceLabels'
	| 'enableForceLayout'
	| 'graphSpacing'
	| 'graphCenterForce'
	| 'graphRepelForce'
	| 'graphLinkForce'
	| 'graphDragLinkForce'
	| 'graphReturnForce'
	| 'graphLinkDistance'
	| 'flowSpacing'
	| 'flowLayerSpacing'
	| 'flowLaneSpacing'
	| 'arcSpacing'
	| 'manualLayout'
	| 'query'
	| 'curated'
	| 'nodeStyleOverrides'
	| 'unresolvedNodeStyleOverrides'
	| 'linkStyleOverrides'
	| 'plainLinkStyleOverrides'
	| 'unresolvedLinkStyleOverrides'
	| 'nodeStyleRules'
	| 'linkStyleRules'
>;

type ActiveChartFallback = Pick<
	WorkspaceState,
	| 'graphSpacing'
	| 'graphCenterForce'
	| 'graphRepelForce'
	| 'graphLinkForce'
	| 'graphDragLinkForce'
	| 'graphReturnForce'
	| 'graphLinkDistance'
	| 'flowSpacing'
	| 'flowLayerSpacing'
	| 'flowLaneSpacing'
	| 'arcSpacing'
>;

const INITIAL_ACTIVE_CHART_FALLBACK: ActiveChartFallback = {
	graphSpacing: 1,
	graphCenterForce: DEFAULT_GRAPH_CENTER_FORCE,
	graphRepelForce: DEFAULT_GRAPH_REPEL_FORCE,
	graphLinkForce: DEFAULT_GRAPH_LINK_FORCE,
	graphDragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
	graphReturnForce: DEFAULT_GRAPH_RETURN_FORCE,
	graphLinkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
	flowSpacing: 1,
	flowLayerSpacing: 1,
	flowLaneSpacing: 1,
	arcSpacing: 1,
};

export function createInitialActiveChartStateFields(
	chart: MetaGraphChart,
): ActiveChartStateFields {
	return createActiveChartStateFields(chart, INITIAL_ACTIVE_CHART_FALLBACK, {
		useChartForceSettingsForAnyChart: true,
	});
}

export function createUpdatedActiveChartStateFields(
	chart: MetaGraphChart,
	currentState: WorkspaceState,
): ActiveChartStateFields {
	return createActiveChartStateFields(chart, currentState, {
		useChartForceSettingsForAnyChart: false,
	});
}

function createActiveChartStateFields(
	chart: MetaGraphChart,
	fallback: ActiveChartFallback,
	options: { useChartForceSettingsForAnyChart: boolean },
): ActiveChartStateFields {
	const forceGraphType = isForceGraphType(chart.type);
	const useChartForceSettings =
		forceGraphType || options.useChartForceSettingsForAnyChart;

	return {
		mode: chart.type,
		chartSource: chart.source,
		flowEdgeStyle: chart.layout.edgeStyle ?? 'orthogonal',
		flowDirection: chart.layout.direction ?? 'LR',
		arcDirection: chart.layout.arcDirection ?? 'right',
		nodeSort: chart.layout.nodeSort ?? 'name',
		nodeSortDirection: chart.layout.nodeSortDirection ?? 'asc',
		fadeDistance: chart.display.fadeDistance,
		labelSize: chart.display.labelSize,
		labelPosition: chart.display.labelPosition,
		labelOffset: chart.display.labelOffset,
		labelColor: chart.display.labelColor,
		labelLightTextColor: chart.display.labelLightTextColor,
		labelLightBackgroundColor: chart.display.labelLightBackgroundColor,
		labelLightBackgroundOpacity: chart.display.labelLightBackgroundOpacity,
		labelDarkTextColor: chart.display.labelDarkTextColor,
		labelDarkBackgroundColor: chart.display.labelDarkBackgroundColor,
		labelDarkBackgroundOpacity: chart.display.labelDarkBackgroundOpacity,
		labelBackgroundOpacity: chart.display.labelBackgroundOpacity,
		labelDensity: chart.display.labelDensity,
		cubeFaceOpacity: chart.display.cubeFaceOpacity,
		forceLabels: chart.display.forceLabels,
		enableForceLayout: chart.display.enableForceLayout,
		graphSpacing: forceGraphType
			? chart.layout.spacing
			: fallback.graphSpacing,
		graphCenterForce: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.centerForce,
			fallback.graphCenterForce,
		),
		graphRepelForce: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.repelForce,
			fallback.graphRepelForce,
		),
		graphLinkForce: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.linkForce,
			fallback.graphLinkForce,
		),
		graphDragLinkForce: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.dragLinkForce,
			fallback.graphDragLinkForce,
		),
		graphReturnForce: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.returnForce,
			fallback.graphReturnForce,
		),
		graphLinkDistance: readGraphForceSetting(
			useChartForceSettings,
			chart.layout.linkDistance,
			fallback.graphLinkDistance,
		),
		flowSpacing:
			chart.type === 'flow' ? chart.layout.spacing : fallback.flowSpacing,
		flowLayerSpacing:
			chart.type === 'flow'
				? (chart.layout.layerSpacing ?? chart.layout.spacing)
				: fallback.flowLayerSpacing,
		flowLaneSpacing:
			chart.type === 'flow'
				? (chart.layout.laneSpacing ?? chart.layout.spacing)
				: fallback.flowLaneSpacing,
		arcSpacing:
			chart.type === 'arc' ? chart.layout.spacing : fallback.arcSpacing,
		manualLayout: cloneSerializable(
			chart.layout.manual ?? { nodes: {}, groups: [] },
		),
		query: cloneSerializable(chart.query),
		curated: cloneSerializable(chart.curated),
		nodeStyleOverrides: cloneSerializable(chart.style.nodeOverrides),
		unresolvedNodeStyleOverrides: cloneSerializable(
			chart.style.unresolvedNodeOverrides,
		),
		linkStyleOverrides: cloneSerializable(chart.style.linkOverrides),
		plainLinkStyleOverrides: cloneSerializable(
			chart.style.plainLinkOverrides,
		),
		unresolvedLinkStyleOverrides: cloneSerializable(
			chart.style.unresolvedLinkOverrides,
		),
		nodeStyleRules: cloneSerializable(chart.style.nodeRules),
		linkStyleRules: cloneSerializable(chart.style.linkRules),
	};
}

function readGraphForceSetting(
	useChartValue: boolean,
	value: number | undefined,
	fallback: number,
): number {
	return useChartValue && value !== undefined ? value : fallback;
}

function isForceGraphType(type: ViewMode): boolean {
	return type === 'graph' || type === 'graph-3d' || type === 'cube';
}
