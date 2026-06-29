import type {
	ArcDirection,
	DefaultLinkStyle,
	DefaultNodeStyle,
	FlowDirection,
	FlowEdgeStyle,
	LabelPosition,
	LinkStyleRule,
	MetaGraphChart,
	NodeStyleRule,
	WorkspaceState,
} from '../core/types';
import {
	normalizeGlobalLinkStyleRules,
	normalizeGlobalNodeStyleRules,
	normalizeLinkStyleRules,
	normalizeNodeStyleRules,
} from './meta-graph-model';
import { cloneSerializable } from './workspace-persistence';
import { updateActiveChartState } from './workspace-state-updaters';

export type GraphForceSettingKey =
	| 'centerForce'
	| 'repelForce'
	| 'linkForce'
	| 'dragLinkForce'
	| 'returnForce'
	| 'linkDistance';

export function setFlowEdgeStyleInState(
	state: WorkspaceState,
	flowEdgeStyle: FlowEdgeStyle,
): WorkspaceState {
	return updateActiveChartLayout(state, { edgeStyle: flowEdgeStyle });
}

export function setFlowDirectionInState(
	state: WorkspaceState,
	flowDirection: FlowDirection,
): WorkspaceState {
	return updateActiveChartLayout(state, { direction: flowDirection });
}

export function setArcDirectionInState(
	state: WorkspaceState,
	arcDirection: ArcDirection,
): WorkspaceState {
	return updateActiveChartLayout(state, { arcDirection }, true);
}

export function setFadeDistanceInState(
	state: WorkspaceState,
	fadeDistance: number,
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display.fadeDistance === fadeDistance
		? state
		: updateActiveChartDisplay(state, { fadeDistance });
}

export function setLabelSizeInState(
	state: WorkspaceState,
	labelSize: number,
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display.labelSize === labelSize
		? state
		: updateActiveChartDisplay(state, { labelSize });
}

export function setLabelPositionInState(
	state: WorkspaceState,
	labelPosition: LabelPosition,
): WorkspaceState {
	return updateActiveChartDisplay(state, { labelPosition });
}

export function setLabelColorInState(
	state: WorkspaceState,
	labelColor: string,
): WorkspaceState {
	return updateActiveChartDisplay(state, { labelColor });
}

export function setLabelBackgroundOpacityInState(
	state: WorkspaceState,
	labelBackgroundOpacity: number,
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display.labelBackgroundOpacity === labelBackgroundOpacity
		? state
		: updateActiveChartDisplay(state, { labelBackgroundOpacity });
}

export function setLabelDensityInState(
	state: WorkspaceState,
	labelDensity: number,
): WorkspaceState {
	const density = Math.max(0, Math.min(1, labelDensity));
	const chart = getActiveChart(state);
	return chart.display.labelDensity === density
		? state
		: updateActiveChartDisplay(state, { labelDensity: density });
}

export function setCubeFaceOpacityInState(
	state: WorkspaceState,
	cubeFaceOpacity: number,
): WorkspaceState {
	const opacity = Math.max(0.05, Math.min(1, cubeFaceOpacity));
	const chart = getActiveChart(state);
	return chart.display.cubeFaceOpacity === opacity
		? state
		: updateActiveChartDisplay(state, { cubeFaceOpacity: opacity });
}

export function setForceLabelsInState(
	state: WorkspaceState,
	forceLabels: boolean,
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display.forceLabels === forceLabels
		? state
		: updateActiveChartDisplay(state, { forceLabels });
}

export function setEnableForceLayoutInState(
	state: WorkspaceState,
	enableForceLayout: boolean,
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display.enableForceLayout === enableForceLayout
		? state
		: updateActiveChartDisplay(state, { enableForceLayout });
}

export function setGraphSpacingInState(
	state: WorkspaceState,
	graphSpacing: number,
): WorkspaceState {
	return setLayoutSpacingInState(state, graphSpacing, false);
}

export function setFlowSpacingInState(
	state: WorkspaceState,
	flowSpacing: number,
): WorkspaceState {
	return setLayoutSpacingInState(state, flowSpacing, true);
}

export function setArcSpacingInState(
	state: WorkspaceState,
	arcSpacing: number,
): WorkspaceState {
	return setLayoutSpacingInState(state, arcSpacing, true);
}

export function setGraphForceSettingInState(
	state: WorkspaceState,
	key: GraphForceSettingKey,
	value: number,
): WorkspaceState {
	const normalized = normalizeForceSetting(value);
	const chart = getActiveChart(state);
	return chart.layout[key] === normalized
		? state
		: updateActiveChartLayout(state, { [key]: normalized });
}

export function setGlobalNodeStyleRulesInState(
	state: WorkspaceState,
	nodeStyleRules: NodeStyleRule[],
): WorkspaceState {
	return {
		...state,
		globalNodeStyleRules: normalizeGlobalNodeStyleRules(nodeStyleRules),
	};
}

export function setGlobalLinkStyleRulesInState(
	state: WorkspaceState,
	linkStyleRules: LinkStyleRule[],
): WorkspaceState {
	return {
		...state,
		globalLinkStyleRules: normalizeGlobalLinkStyleRules(linkStyleRules),
	};
}

export function setDefaultNodeStyleInState(
	state: WorkspaceState,
	defaultNodeStyle: Required<DefaultNodeStyle>,
): WorkspaceState {
	return {
		...state,
		defaultNodeStyle: cloneSerializable(defaultNodeStyle),
	};
}

export function setDefaultLinkStyleInState(
	state: WorkspaceState,
	defaultLinkStyle: Required<DefaultLinkStyle>,
): WorkspaceState {
	return {
		...state,
		defaultLinkStyle: cloneSerializable(defaultLinkStyle),
	};
}

export function setNodeStyleOverridesInState(
	state: WorkspaceState,
	nodeStyleOverrides: DefaultNodeStyle,
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		style: {
			...chart.style,
			nodeOverrides: cloneSerializable(nodeStyleOverrides),
		},
	});
}

export function setLinkStyleOverridesInState(
	state: WorkspaceState,
	linkStyleOverrides: DefaultLinkStyle,
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		style: {
			...chart.style,
			linkOverrides: cloneSerializable(linkStyleOverrides),
		},
	});
}

export function setNodeStyleRulesInState(
	state: WorkspaceState,
	nodeStyleRules: NodeStyleRule[],
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		style: {
			...chart.style,
			nodeRules: normalizeNodeStyleRules(nodeStyleRules),
		},
	});
}

export function setLinkStyleRulesInState(
	state: WorkspaceState,
	linkStyleRules: LinkStyleRule[],
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		style: {
			...chart.style,
			linkRules: normalizeLinkStyleRules(linkStyleRules),
		},
	});
}

function setLayoutSpacingInState(
	state: WorkspaceState,
	value: number,
	forceLayout: boolean,
): WorkspaceState {
	const spacing = normalizeSpacing(value);
	const chart = getActiveChart(state);
	return chart.layout.spacing === spacing
		? state
		: updateActiveChartLayout(state, { spacing }, forceLayout);
}

function updateActiveChartLayout(
	state: WorkspaceState,
	patch: Partial<MetaGraphChart['layout']>,
	forceLayout = false,
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(
		state,
		{
			layout: {
				...chart.layout,
				...patch,
			},
		},
		forceLayout,
	);
}

function updateActiveChartDisplay(
	state: WorkspaceState,
	patch: Partial<MetaGraphChart['display']>,
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		display: {
			...chart.display,
			...patch,
		},
	});
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}

function normalizeSpacing(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeForceSetting(value: number): number {
	return Number.isFinite(value) && value >= 0 ? value : 1;
}
