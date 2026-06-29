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
	shouldRebuild: boolean;
	fitAfterRender: boolean;
	forceLayout: boolean;
}

export function analyzeWorkspaceStateChanges(
	nextState: WorkspaceState,
	currentState: WorkspaceState,
	baseline: WorkspaceRenderBaseline,
): WorkspaceStateChanges {
	const activeChartChanged =
		baseline.activeChartId !== undefined &&
		nextState.activeChartId !== baseline.activeChartId;
	const modeChanged =
		baseline.mode !== undefined && nextState.mode !== baseline.mode;
	const chartSourceChanged =
		baseline.chartSource !== undefined &&
		nextState.chartSource !== baseline.chartSource;
	const flowStyleChanged =
		baseline.flowEdgeStyle !== undefined &&
		nextState.flowEdgeStyle !== baseline.flowEdgeStyle;
	const flowDirectionChanged =
		baseline.flowDirection !== undefined &&
		nextState.flowDirection !== baseline.flowDirection;
	const arcDirectionChanged =
		baseline.arcDirection !== undefined &&
		nextState.arcDirection !== baseline.arcDirection;
	const layoutRevisionChanged =
		baseline.layoutRevision !== undefined &&
		nextState.layoutRevision !== baseline.layoutRevision;
	const styleRulesChanged =
		nextState.globalNodeStyleRules !== baseline.globalNodeStyleRules ||
		nextState.globalLinkStyleRules !== baseline.globalLinkStyleRules ||
		nextState.nodeStyleRules !== baseline.nodeStyleRules ||
		nextState.linkStyleRules !== baseline.linkStyleRules;

	return {
		manualLayoutChanged:
			baseline.manualLayout !== undefined &&
			nextState.manualLayout !== baseline.manualLayout,
		fadeDistanceChanged: nextState.fadeDistance !== currentState.fadeDistance,
		labelSizeChanged: nextState.labelSize !== currentState.labelSize,
		labelPositionChanged:
			nextState.labelPosition !== currentState.labelPosition,
		labelColorChanged: nextState.labelColor !== currentState.labelColor,
		labelBackgroundOpacityChanged:
			nextState.labelBackgroundOpacity !==
			currentState.labelBackgroundOpacity,
		labelDensityChanged: nextState.labelDensity !== currentState.labelDensity,
		cubeFaceOpacityChanged:
			nextState.cubeFaceOpacity !== currentState.cubeFaceOpacity,
		forceLabelsChanged: nextState.forceLabels !== currentState.forceLabels,
		graphForceSettingsChanged:
			nextState.graphSpacing !== currentState.graphSpacing ||
			nextState.graphCenterForce !== currentState.graphCenterForce ||
			nextState.graphRepelForce !== currentState.graphRepelForce ||
			nextState.graphLinkForce !== currentState.graphLinkForce ||
			nextState.graphDragLinkForce !== currentState.graphDragLinkForce ||
			nextState.graphReturnForce !== currentState.graphReturnForce ||
			nextState.graphLinkDistance !== currentState.graphLinkDistance,
		forceLayoutChanged:
			nextState.enableForceLayout !== currentState.enableForceLayout,
		shouldRebuild:
			nextState.activeChartId !== baseline.activeChartId ||
			nextState.projection !== baseline.projection ||
			nextState.mode !== baseline.mode ||
			nextState.chartSource !== baseline.chartSource ||
			nextState.flowEdgeStyle !== baseline.flowEdgeStyle ||
			nextState.flowDirection !== baseline.flowDirection ||
			nextState.arcDirection !== baseline.arcDirection ||
			nextState.layoutRevision !== baseline.layoutRevision ||
			styleRulesChanged,
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
		globalNodeStyleRules: state.globalNodeStyleRules,
		globalLinkStyleRules: state.globalLinkStyleRules,
		nodeStyleRules: state.nodeStyleRules,
		linkStyleRules: state.linkStyleRules,
	};
}
