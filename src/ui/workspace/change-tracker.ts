import type { GraphProjection, WorkspaceState } from '../../core/types';

export interface WorkspaceRenderBaseline {
	projection?: WorkspaceState['projection'];
	projectionSignature?: string;
	activeChartId?: string;
	mode?: WorkspaceState['mode'];
	chartSource?: WorkspaceState['chartSource'];
	flowEdgeStyle?: WorkspaceState['flowEdgeStyle'];
	flowDirection?: WorkspaceState['flowDirection'];
	arcDirection?: WorkspaceState['arcDirection'];
	nodeSort?: WorkspaceState['nodeSort'];
	nodeSortDirection?: WorkspaceState['nodeSortDirection'];
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
	labelOffsetChanged: boolean;
	labelColorChanged: boolean;
	labelThemeChanged: boolean;
	labelBackgroundOpacityChanged: boolean;
	labelDensityChanged: boolean;
	cubeFaceOpacityChanged: boolean;
	forceLabelsChanged: boolean;
	graphForceSettingsChanged: boolean;
	forceLayoutChanged: boolean;
	styleRulesChanged: boolean;
	graphVisibilityChanged: boolean;
	shouldRebuild: boolean;
	fitAfterRender: boolean;
	forceLayout: boolean;
}

type WorkspaceStateKey = keyof WorkspaceState;
type WorkspaceBaselineKey = keyof WorkspaceRenderBaseline;
type WorkspaceStateBaselineKey = Extract<
	WorkspaceBaselineKey,
	WorkspaceStateKey
>;

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
] as const satisfies readonly WorkspaceStateBaselineKey[];

const REBUILD_BASELINE_KEYS = [
	'activeChartId',
	'mode',
	'chartSource',
	'flowEdgeStyle',
	'flowDirection',
	'arcDirection',
	'nodeSort',
	'nodeSortDirection',
	'layoutRevision',
] as const satisfies readonly WorkspaceStateBaselineKey[];

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
	const nodeSortChanged =
		baselineValueChanged(nextState, baseline, 'nodeSort') ||
		baselineValueChanged(nextState, baseline, 'nodeSortDirection');
	const projectionChanged =
		baseline.projectionSignature !== undefined &&
		readProjectionSignature(nextState.projection) !==
			baseline.projectionSignature;
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
	const graphVisibilityChanged = projectionHiddenNodeIdsChanged(
		nextState.projection,
		currentState.projection,
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
		labelSizeChanged: stateValueChanged(
			nextState,
			currentState,
			'labelSize',
		),
		labelPositionChanged: stateValueChanged(
			nextState,
			currentState,
			'labelPosition',
		),
		labelOffsetChanged: stateValueChanged(
			nextState,
			currentState,
			'labelOffset',
		),
		labelColorChanged: stateValueChanged(
			nextState,
			currentState,
			'labelColor',
		),
		labelThemeChanged:
			stateValueChanged(nextState, currentState, 'labelLightTextColor') ||
			stateValueChanged(
				nextState,
				currentState,
				'labelLightBackgroundColor',
			) ||
			stateValueChanged(
				nextState,
				currentState,
				'labelLightBackgroundOpacity',
			) ||
			stateValueChanged(nextState, currentState, 'labelDarkTextColor') ||
			stateValueChanged(
				nextState,
				currentState,
				'labelDarkBackgroundColor',
			) ||
			stateValueChanged(
				nextState,
				currentState,
				'labelDarkBackgroundOpacity',
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
		graphVisibilityChanged,
		shouldRebuild:
			projectionChanged ||
			stateDiffersFromBaseline(
				nextState,
				baseline,
				REBUILD_BASELINE_KEYS,
			),
		fitAfterRender:
			activeChartChanged ||
			modeChanged ||
			chartSourceChanged ||
			(projectionChanged && nextState.mode !== 'cube') ||
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			nodeSortChanged ||
			(layoutRevisionChanged && nextState.mode !== 'cube'),
		forceLayout:
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			nodeSortChanged ||
			layoutRevisionChanged ||
			chartSourceChanged,
	};
}

function projectionHiddenNodeIdsChanged(
	nextProjection: GraphProjection | undefined,
	currentProjection: GraphProjection | undefined,
): boolean {
	return !setsEqual(
		nextProjection?.hiddenNodeIds ?? new Set<string>(),
		currentProjection?.hiddenNodeIds ?? new Set<string>(),
	);
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
}

function stateValueChanged<Key extends WorkspaceStateKey>(
	nextState: WorkspaceState,
	currentState: WorkspaceState,
	key: Key,
): boolean {
	return nextState[key] !== currentState[key];
}

function baselineValueChanged<Key extends WorkspaceStateBaselineKey>(
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

function stateDiffersFromBaseline<Key extends WorkspaceStateBaselineKey>(
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
		projectionSignature: readProjectionSignature(state.projection),
		activeChartId: state.activeChartId,
		mode: state.mode,
		chartSource: state.chartSource,
		flowEdgeStyle: state.flowEdgeStyle,
		flowDirection: state.flowDirection,
		arcDirection: state.arcDirection,
		nodeSort: state.nodeSort,
		nodeSortDirection: state.nodeSortDirection,
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

function syncBaselineValue<Key extends WorkspaceStateBaselineKey>(
	baseline: WorkspaceRenderBaseline,
	state: WorkspaceState,
	key: Key,
): void {
	baseline[key] = state[key];
}

function readProjectionSignature(
	projection: GraphProjection | undefined,
): string {
	if (!projection) {
		return '';
	}
	const nodeParts = projection.nodes
		.map((node) =>
			[
				node.id,
				node.path,
				node.title,
				node.folder,
				node.noteType ?? '',
				String(node.createdTime ?? ''),
				String(node.modifiedTime ?? ''),
				...(node.domains ?? []),
				...(node.tags ?? []),
			].join('\u001f'),
		)
		.sort();
	const edgeParts = projection.edges
		.map((edge) =>
			[
				edge.id,
				edge.source,
				edge.target,
				edge.relation,
				edge.directed ? '1' : '0',
				edge.sourcePath,
				edge.sourceField,
			].join('\u001f'),
		)
		.sort();
	const rootParts = [...projection.rootIds].sort();
	const primaryParts = [
		...(projection.primaryIds ?? new Set<string>()),
	].sort();
	const contextParts = [
		...(projection.contextIds ?? new Set<string>()),
	].sort();
	return [
		`n:${nodeParts.join('\u001e')}`,
		`e:${edgeParts.join('\u001e')}`,
		`r:${rootParts.join('\u001e')}`,
		`p:${primaryParts.join('\u001e')}`,
		`c:${contextParts.join('\u001e')}`,
	].join('\u001d');
}
