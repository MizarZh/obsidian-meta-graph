import type { WorkspaceState } from '../../core/types';

export interface WorkspaceRenderBaseline {
	projection?: WorkspaceState['projection'];
	activeChartId?: string;
	mode?: WorkspaceState['mode'];
	chartSource?: WorkspaceState['chartSource'];
	flowEdgeStyle?: WorkspaceState['flowEdgeStyle'];
	flowDirection?: WorkspaceState['flowDirection'];
	arcDirection?: WorkspaceState['arcDirection'];
	manualLayout?: WorkspaceState['manualLayout'];
	layoutRevision?: number;
	defaultNodeStyle?: WorkspaceState['defaultNodeStyle'];
	defaultLinkStyle?: WorkspaceState['defaultLinkStyle'];
	nodeStyleOverrides?: WorkspaceState['nodeStyleOverrides'];
	linkStyleOverrides?: WorkspaceState['linkStyleOverrides'];
	globalNodeStyleRules?: WorkspaceState['globalNodeStyleRules'];
	globalLinkStyleRules?: WorkspaceState['globalLinkStyleRules'];
	nodeStyleRules?: WorkspaceState['nodeStyleRules'];
	linkStyleRules?: WorkspaceState['linkStyleRules'];
}

export interface WorkspaceStateChanges {
	manualLayoutChanged: boolean;
	fadeDistanceChanged: boolean;
	labelSizeChanged: boolean;
	labelPositionChanged: boolean;
	labelColorChanged: boolean;
	labelBackgroundOpacityChanged: boolean;
	labelDensityChanged: boolean;
	cubeFaceOpacityChanged: boolean;
	forceLabelsChanged: boolean;
	graphForceSettingsChanged: boolean;
	forceLayoutChanged: boolean;
	styleRulesChanged: boolean;
	shouldRebuild: boolean;
	fitAfterRender: boolean;
	forceLayout: boolean;
}

type WorkspaceStateKey = keyof WorkspaceState;
type WorkspaceBaselineKey = keyof WorkspaceRenderBaseline;

const GRAPH_FORCE_SETTING_KEYS = [
	'graphSpacing',
	'graphCenterForce',
	'graphRepelForce',
	'graphLinkForce',
	'graphDragLinkForce',
	'graphReturnForce',
	'graphLinkDistance',
] as const satisfies readonly WorkspaceStateKey[];

const STYLE_RULE_KEYS = [
	'defaultNodeStyle',
	'defaultLinkStyle',
	'nodeStyleOverrides',
	'linkStyleOverrides',
	'globalNodeStyleRules',
	'globalLinkStyleRules',
	'nodeStyleRules',
	'linkStyleRules',
] as const satisfies readonly WorkspaceBaselineKey[];

const REBUILD_BASELINE_KEYS = [
	'activeChartId',
	'projection',
	'mode',
	'chartSource',
	'flowEdgeStyle',
	'flowDirection',
	'arcDirection',
	'layoutRevision',
] as const satisfies readonly WorkspaceBaselineKey[];

export function analyzeWorkspaceStateChanges(
	nextState: WorkspaceState,
	currentState: WorkspaceState,
	baseline: WorkspaceRenderBaseline,
): WorkspaceStateChanges {
	const activeChartChanged = baselineValueChanged(
		nextState,
		baseline,
		'activeChartId',
	);
	const modeChanged = baselineValueChanged(nextState, baseline, 'mode');
	const chartSourceChanged = baselineValueChanged(
		nextState,
		baseline,
		'chartSource',
	);
	const flowStyleChanged = baselineValueChanged(
		nextState,
		baseline,
		'flowEdgeStyle',
	);
	const flowDirectionChanged = baselineValueChanged(
		nextState,
		baseline,
		'flowDirection',
	);
	const arcDirectionChanged = baselineValueChanged(
		nextState,
		baseline,
		'arcDirection',
	);
	const layoutRevisionChanged = baselineValueChanged(
		nextState,
		baseline,
		'layoutRevision',
	);
	const styleRulesChanged = stateDiffersFromBaseline(
		nextState,
		baseline,
		STYLE_RULE_KEYS,
	);

	return {
		manualLayoutChanged: baselineValueChanged(
			nextState,
			baseline,
			'manualLayout',
		),
		fadeDistanceChanged: stateValueChanged(
			nextState,
			currentState,
			'fadeDistance',
		),
		labelSizeChanged: stateValueChanged(nextState, currentState, 'labelSize'),
		labelPositionChanged: stateValueChanged(
			nextState,
			currentState,
			'labelPosition',
		),
		labelColorChanged: stateValueChanged(
			nextState,
			currentState,
			'labelColor',
		),
		labelBackgroundOpacityChanged: stateValueChanged(
			nextState,
			currentState,
			'labelBackgroundOpacity',
		),
		labelDensityChanged: stateValueChanged(
			nextState,
			currentState,
			'labelDensity',
		),
		cubeFaceOpacityChanged:
			nextState.cubeFaceOpacity !== currentState.cubeFaceOpacity,
		forceLabelsChanged: stateValueChanged(
			nextState,
			currentState,
			'forceLabels',
		),
		graphForceSettingsChanged: stateDiffers(
			nextState,
			currentState,
			GRAPH_FORCE_SETTING_KEYS,
		),
		forceLayoutChanged: stateValueChanged(
			nextState,
			currentState,
			'enableForceLayout',
		),
		styleRulesChanged,
		shouldRebuild: stateDiffersFromBaseline(
			nextState,
			baseline,
			REBUILD_BASELINE_KEYS,
		),
		fitAfterRender:
			activeChartChanged ||
			modeChanged ||
			chartSourceChanged ||
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			(layoutRevisionChanged && nextState.mode !== 'cube'),
		forceLayout:
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			layoutRevisionChanged ||
			chartSourceChanged,
	};
}

function stateValueChanged<Key extends WorkspaceStateKey>(
	nextState: WorkspaceState,
	currentState: WorkspaceState,
	key: Key,
): boolean {
	return nextState[key] !== currentState[key];
}

function baselineValueChanged<Key extends WorkspaceBaselineKey>(
	nextState: WorkspaceState,
	baseline: WorkspaceRenderBaseline,
	key: Key,
): boolean {
	return baseline[key] !== undefined && nextState[key] !== baseline[key];
}

function stateDiffers<Key extends WorkspaceStateKey>(
	nextState: WorkspaceState,
	currentState: WorkspaceState,
	keys: readonly Key[],
): boolean {
	return keys.some((key) => stateValueChanged(nextState, currentState, key));
}

function stateDiffersFromBaseline<Key extends WorkspaceBaselineKey>(
	nextState: WorkspaceState,
	baseline: WorkspaceRenderBaseline,
	keys: readonly Key[],
): boolean {
	return keys.some((key) => nextState[key] !== baseline[key]);
}

export function createWorkspaceRenderBaseline(
	state: WorkspaceState,
): WorkspaceRenderBaseline {
	return {
		projection: state.projection,
		activeChartId: state.activeChartId,
		mode: state.mode,
		chartSource: state.chartSource,
		flowEdgeStyle: state.flowEdgeStyle,
		flowDirection: state.flowDirection,
		arcDirection: state.arcDirection,
			manualLayout: state.manualLayout,
			layoutRevision: state.layoutRevision,
			defaultNodeStyle: state.defaultNodeStyle,
			defaultLinkStyle: state.defaultLinkStyle,
			nodeStyleOverrides: state.nodeStyleOverrides,
			linkStyleOverrides: state.linkStyleOverrides,
			globalNodeStyleRules: state.globalNodeStyleRules,
		globalLinkStyleRules: state.globalLinkStyleRules,
		nodeStyleRules: state.nodeStyleRules,
		linkStyleRules: state.linkStyleRules,
	};
}

export function syncWorkspaceRenderBaselineStyles(
	baseline: WorkspaceRenderBaseline,
	state: WorkspaceState,
): void {
	for (const key of STYLE_RULE_KEYS) {
		syncBaselineValue(baseline, state, key);
	}
}

function syncBaselineValue<Key extends WorkspaceBaselineKey>(
	baseline: WorkspaceRenderBaseline,
	state: WorkspaceState,
	key: Key,
): void {
	baseline[key] = state[key];
}
