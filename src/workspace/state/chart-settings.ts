import type {
	ArcDirection,
	FlowDirection,
	FlowEdgeStyle,
	LabelPosition,
	MetaGraphChart,
	WorkspaceState,
} from '../../core/types';
import { updateActiveChartState } from './state-updaters';

export type GraphForceSettingKey =
	| 'centerForce'
	| 'repelForce'
	| 'linkForce'
	| 'dragLinkForce'
	| 'returnForce'
	| 'linkDistance';
type ChartDisplayKey = keyof MetaGraphChart['display'];

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
	return setDisplayValue(state, 'fadeDistance', fadeDistance);
}

export function setLabelSizeInState(
	state: WorkspaceState,
	labelSize: number,
): WorkspaceState {
	return setDisplayValue(state, 'labelSize', labelSize);
}

export function setLabelPositionInState(
	state: WorkspaceState,
	labelPosition: LabelPosition,
): WorkspaceState {
	return setDisplayValue(state, 'labelPosition', labelPosition);
}

export function setLabelOffsetInState(
	state: WorkspaceState,
	labelOffset: number,
): WorkspaceState {
	return setDisplayValue(state, 'labelOffset', Math.max(0, labelOffset));
}

export function setLabelColorInState(
	state: WorkspaceState,
	labelColor: string,
): WorkspaceState {
	return setDisplayValue(state, 'labelColor', labelColor);
}

export function setLabelLightTextColorInState(
	state: WorkspaceState,
	labelLightTextColor: string,
): WorkspaceState {
	return setDisplayValue(state, 'labelLightTextColor', labelLightTextColor);
}

export function setLabelLightBackgroundColorInState(
	state: WorkspaceState,
	labelLightBackgroundColor: string,
): WorkspaceState {
	return setDisplayValue(
		state,
		'labelLightBackgroundColor',
		labelLightBackgroundColor,
	);
}

export function setLabelLightBackgroundOpacityInState(
	state: WorkspaceState,
	labelLightBackgroundOpacity: number,
): WorkspaceState {
	return setDisplayValue(
		state,
		'labelLightBackgroundOpacity',
		Math.max(0, Math.min(1, labelLightBackgroundOpacity)),
	);
}

export function setLabelDarkTextColorInState(
	state: WorkspaceState,
	labelDarkTextColor: string,
): WorkspaceState {
	return setDisplayValue(state, 'labelDarkTextColor', labelDarkTextColor);
}

export function setLabelDarkBackgroundColorInState(
	state: WorkspaceState,
	labelDarkBackgroundColor: string,
): WorkspaceState {
	return setDisplayValue(
		state,
		'labelDarkBackgroundColor',
		labelDarkBackgroundColor,
	);
}

export function setLabelDarkBackgroundOpacityInState(
	state: WorkspaceState,
	labelDarkBackgroundOpacity: number,
): WorkspaceState {
	return setDisplayValue(
		state,
		'labelDarkBackgroundOpacity',
		Math.max(0, Math.min(1, labelDarkBackgroundOpacity)),
	);
}

export function setLabelBackgroundOpacityInState(
	state: WorkspaceState,
	labelBackgroundOpacity: number,
): WorkspaceState {
	return setDisplayValue(
		state,
		'labelBackgroundOpacity',
		labelBackgroundOpacity,
	);
}

export function setLabelDensityInState(
	state: WorkspaceState,
	labelDensity: number,
): WorkspaceState {
	const density = Math.max(0, Math.min(1, labelDensity));
	return setDisplayValue(state, 'labelDensity', density);
}

export function setCubeFaceOpacityInState(
	state: WorkspaceState,
	cubeFaceOpacity: number,
): WorkspaceState {
	const opacity = Math.max(0.05, Math.min(1, cubeFaceOpacity));
	return setDisplayValue(state, 'cubeFaceOpacity', opacity);
}

export function setForceLabelsInState(
	state: WorkspaceState,
	forceLabels: boolean,
): WorkspaceState {
	return setDisplayValue(state, 'forceLabels', forceLabels);
}

export function setEnableForceLayoutInState(
	state: WorkspaceState,
	enableForceLayout: boolean,
): WorkspaceState {
	return setDisplayValue(state, 'enableForceLayout', enableForceLayout);
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

function setDisplayValue<Key extends ChartDisplayKey>(
	state: WorkspaceState,
	key: Key,
	value: MetaGraphChart['display'][Key],
): WorkspaceState {
	const chart = getActiveChart(state);
	return chart.display[key] === value
		? state
		: updateActiveChartDisplay(state, { [key]: value });
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
