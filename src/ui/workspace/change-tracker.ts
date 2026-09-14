import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import { setsEqual } from '@/core/sets';
import type {
	ChartGroupingConfig,
	GraphProjection,
	ChartStyleConfig,
	NodeStyleRule,
	WorkspaceState,
} from '@/core/types';
import { matchesNodeCriterion } from '@/query/filters';
import { resolveChartGroupOwnership } from '@/query/group-ownership';

export interface WorkspaceRenderBaseline {
	chartStyle?: ChartStyleConfig;
	trace?: WorkspaceState['trace'];
	projection?: WorkspaceState['projection'];
	projectionSignature?: string;
	projectionGroupSignature?: string;
	activeChartId?: string;
	mode?: WorkspaceState['mode'];
	renderer?: WorkspaceState['renderer'];
	chartSource?: WorkspaceState['chartSource'];
	flowEdgeStyle?: WorkspaceState['flowEdgeStyle'];
	flowDirection?: WorkspaceState['flowDirection'];
	flowLayerSpacing?: number;
	flowLaneSpacing?: number;
	flowCornerRadius?: WorkspaceState['flowCornerRadius'];
	arcDirection?: WorkspaceState['arcDirection'];
	arcLabelAngle?: WorkspaceState['arcLabelAngle'];
	nodeSort?: WorkspaceState['nodeSort'];
	nodeSortDirection?: WorkspaceState['nodeSortDirection'];
	grouping?: WorkspaceState['grouping'];
	manualLayout?: WorkspaceState['manualLayout'];
	layoutRevision?: number;
	defaultNodeStyle?: WorkspaceState['defaultNodeStyle'];
	defaultLinkStyle?: WorkspaceState['defaultLinkStyle'];
	globalNodeStyleRules?: WorkspaceState['globalNodeStyleRules'];
	globalLinkStyleRules?: WorkspaceState['globalLinkStyleRules'];
}

export interface WorkspaceStateChanges {
	groupingChanged: boolean;
	manualLayoutChanged: boolean;
	fadeDistanceChanged: boolean;
	labelSizeChanged: boolean;
	scaleLabelsWithZoomChanged: boolean;
	threeLabelResolutionChanged: boolean;
	labelBoldChanged: boolean;
	labelItalicChanged: boolean;
	labelPositionChanged: boolean;
	labelOffsetChanged: boolean;
	labelMaxWidthChanged?: boolean;
	labelThemeChanged: boolean;
	labelDensityChanged: boolean;
	cubeFaceOpacityChanged: boolean;
	parallelEdgeStyleChanged?: boolean;
	cubeSizeChanged: boolean;
	cubeFreeCameraChanged: boolean;
	forceLabelsChanged: boolean;
	graphForceSettingsChanged: boolean;
	forceLayoutChanged: boolean;
	styleRulesChanged: boolean;
	graphVisibilityChanged: boolean;
	shouldRebuild: boolean;
	fitAfterRender: boolean;
	forceLayout: boolean;
	preserveViewportScale?: boolean;
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
	'trace',
	'defaultNodeStyle',
	'defaultLinkStyle',
	'globalNodeStyleRules',
	'globalLinkStyleRules',
] as const satisfies readonly WorkspaceStateBaselineKey[];

const REBUILD_BASELINE_KEYS = [
	'activeChartId',
	'mode',
	'renderer',
	'chartSource',
	'flowEdgeStyle',
	'flowDirection',
	'flowCornerRadius',
	'arcDirection',
	'arcLabelAngle',
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
	const rendererChanged = baselineValueChanged(
		nextState,
		baseline,
		'renderer',
	);
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
		!hasSameProjectionTopologyReferences(
			nextState.projection,
			baseline.projection,
		) &&
		readProjectionSignature(nextState) !== baseline.projectionSignature;
	const layoutRevisionChanged = baselineValueChanged(
		nextState,
		baseline,
		'layoutRevision',
	);
	const projectionGroupsChanged =
		baseline.projectionGroupSignature !== undefined &&
		nextState.projection?.nodes !== baseline.projection?.nodes &&
		readProjectionGroupSignature(nextState) !==
			baseline.projectionGroupSignature;
	const styleRulesChanged =
		projectionStyleMatchesChanged(
			nextState.projection,
			currentState.projection,
			[
				...nextState.globalNodeStyleRules,
				...getActiveChartStyle(nextState).nodeRules,
			],
		) ||
		getActiveChartStyle(nextState) !== baseline.chartStyle ||
		stateDiffersFromBaseline(nextState, baseline, STYLE_RULE_KEYS);
	const graphVisibilityChanged = projectionHiddenNodeIdsChanged(
		nextState.projection,
		currentState.projection,
	);
	const groupingChanged = baselineValueChanged(
		nextState,
		baseline,
		'grouping',
	);
	const groupingOrderOnly =
		groupingChanged && isHarmlessGroupReorder(nextState, baseline);
	const groupingRequiresLayout =
		groupingChanged &&
		!groupingOrderOnly &&
		(nextState.mode !== 'graph' ||
			graphGroupingMembershipChanged(
				nextState.grouping,
				baseline.grouping,
			));

	const preserveViewportScale =
		nextState.mode === 'flow' &&
		!activeChartChanged &&
		!modeChanged &&
		!rendererChanged &&
		!chartSourceChanged &&
		!projectionChanged &&
		!flowStyleChanged &&
		!flowDirectionChanged &&
		!nodeSortChanged &&
		(baselineValueChanged(nextState, baseline, 'flowLayerSpacing') ||
			baselineValueChanged(nextState, baseline, 'flowLaneSpacing')) &&
		// Chart setters clone grouping even when only spacing changes.
		// Only a content change should invalidate the preserved frame.
		(!groupingChanged ||
			JSON.stringify(nextState.grouping) ===
				JSON.stringify(baseline.grouping));

	return {
		preserveViewportScale,
		groupingChanged,
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
		scaleLabelsWithZoomChanged: stateValueChanged(
			nextState,
			currentState,
			'scaleLabelsWithZoom',
		),
		threeLabelResolutionChanged: stateValueChanged(
			nextState,
			currentState,
			'threeLabelResolution',
		),
		labelBoldChanged: stateValueChanged(
			nextState,
			currentState,
			'labelBold',
		),
		labelItalicChanged: stateValueChanged(
			nextState,
			currentState,
			'labelItalic',
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
		labelMaxWidthChanged: stateValueChanged(
			nextState,
			currentState,
			'labelMaxWidth',
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
		labelDensityChanged: stateValueChanged(
			nextState,
			currentState,
			'labelDensity',
		),
		cubeFaceOpacityChanged:
			nextState.cubeFaceOpacity !== currentState.cubeFaceOpacity,
		parallelEdgeStyleChanged:
			nextState.parallelEdgeStyle !== currentState.parallelEdgeStyle,
		cubeSizeChanged: nextState.cubeSize !== currentState.cubeSize,
		cubeFreeCameraChanged:
			nextState.cubeFreeCamera !== currentState.cubeFreeCamera,
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
			projectionGroupsChanged ||
			projectionChanged ||
			(groupingChanged &&
				!groupingOrderOnly &&
				(nextState.mode === 'graph' ||
					nextState.mode === 'free' ||
					nextState.mode === 'flow' ||
					nextState.mode === 'arc' ||
					nextState.mode === 'hierarchical-edge-bundling')) ||
			stateDiffersFromBaseline(
				nextState,
				baseline,
				REBUILD_BASELINE_KEYS,
			),
		fitAfterRender:
			(projectionGroupsChanged && nextState.mode !== 'cube') ||
			activeChartChanged ||
			modeChanged ||
			rendererChanged ||
			chartSourceChanged ||
			(projectionChanged && nextState.mode !== 'cube') ||
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			nodeSortChanged ||
			(layoutRevisionChanged &&
				nextState.mode !== 'cube' &&
				!preserveViewportScale),
		forceLayout:
			projectionGroupsChanged ||
			flowStyleChanged ||
			flowDirectionChanged ||
			arcDirectionChanged ||
			nodeSortChanged ||
			groupingRequiresLayout ||
			layoutRevisionChanged ||
			chartSourceChanged,
	};
}

function hasSameProjectionTopologyReferences(
	nextProjection: GraphProjection | undefined,
	baselineProjection: GraphProjection | undefined,
): boolean {
	if (!nextProjection || !baselineProjection) {
		return nextProjection === baselineProjection;
	}
	return (
		nextProjection.nodes === baselineProjection.nodes &&
		nextProjection.edges === baselineProjection.edges &&
		nextProjection.rootIds === baselineProjection.rootIds &&
		nextProjection.primaryIds === baselineProjection.primaryIds &&
		nextProjection.contextIds === baselineProjection.contextIds
	);
}

/** Graph/Free do not use list order as a spatial layout input. */
function isHarmlessGroupReorder(
	state: WorkspaceState,
	baseline: WorkspaceRenderBaseline,
): boolean {
	if (
		(state.mode !== 'graph' && state.mode !== 'free') ||
		!baseline.grouping ||
		!state.projection
	)
		return false;
	const previous = baseline.grouping;
	const next = state.grouping;
	if (next.groups.length !== previous.groups.length) return false;
	const byId = new Map(previous.groups.map((group) => [group.id, group]));
	if (
		next.groups.some(
			(group) =>
				JSON.stringify(group) !== JSON.stringify(byId.get(group.id)),
		)
	)
		return false;
	const normalize = (grouping: ChartGroupingConfig) =>
		JSON.stringify({
			...grouping,
			groups: [...grouping.groups].sort((a, b) =>
				a.id.localeCompare(b.id),
			),
		});
	if (normalize(next) !== normalize(previous)) return false;
	const before = resolveChartGroupOwnership(state.projection.nodes, previous);
	const after = resolveChartGroupOwnership(state.projection.nodes, next);
	return [...after.byNode].every(
		([id, entry]) => entry.groupId === before.byNode.get(id)?.groupId,
	);
}

function graphGroupingMembershipChanged(
	nextGrouping: ChartGroupingConfig,
	baselineGrouping: ChartGroupingConfig | undefined,
): boolean {
	if (!baselineGrouping) {
		return true;
	}
	return (
		graphGroupingMembershipSignature(nextGrouping) !==
		graphGroupingMembershipSignature(baselineGrouping)
	);
}

function graphGroupingMembershipSignature(
	grouping: ChartGroupingConfig,
): string {
	return JSON.stringify({
		groups: grouping.groups.map((group) => ({
			id: group.id,
			mode: group.mode,
			rule: group.rule ?? null,
		})),
		overrides: Object.entries(grouping.overrides).sort(([left], [right]) =>
			left.localeCompare(right),
		),
	});
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
		chartStyle: getActiveChartStyle(state),
		projection: state.projection,
		projectionSignature: readProjectionSignature(state),
		projectionGroupSignature: readProjectionGroupSignature(state),
		activeChartId: state.activeChartId,
		mode: state.mode,
		renderer: state.renderer,
		chartSource: state.chartSource,
		flowEdgeStyle: state.flowEdgeStyle,
		flowDirection: state.flowDirection,
		flowLayerSpacing: state.flowLayerSpacing,
		flowLaneSpacing: state.flowLaneSpacing,
		flowCornerRadius: state.flowCornerRadius,
		arcDirection: state.arcDirection,
		arcLabelAngle: state.arcLabelAngle,
		nodeSort: state.nodeSort,
		nodeSortDirection: state.nodeSortDirection,
		grouping: state.grouping,
		manualLayout: state.manualLayout,
		layoutRevision: state.layoutRevision,
		defaultNodeStyle: state.defaultNodeStyle,
		defaultLinkStyle: state.defaultLinkStyle,
		globalNodeStyleRules: state.globalNodeStyleRules,
		globalLinkStyleRules: state.globalLinkStyleRules,
		trace: state.trace,
	};
}

export function syncWorkspaceRenderBaselineStyles(
	baseline: WorkspaceRenderBaseline,
	state: WorkspaceState,
): void {
	baseline.chartStyle = getActiveChartStyle(state);
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

function readProjectionSignature(state: WorkspaceState): string {
	const projection = state.projection;
	if (!projection) {
		return '';
	}
	// Only Arc/HEB consume nodeSort. Other modes may retain it after switching.
	const usesTimeSort =
		state.mode === 'arc' || state.mode === 'hierarchical-edge-bundling';
	const nodeParts = projection.nodes
		.map((node) =>
			[
				node.id,
				node.kind ?? 'note',
				node.path,
				node.title,
				node.folder,
				node.noteType ?? '',
				String(
					usesTimeSort && state.nodeSort === 'created'
						? (node.createdTime ?? '')
						: '',
				),
				String(
					usesTimeSort && state.nodeSort === 'modified'
						? (node.modifiedTime ?? '')
						: '',
				),
				...(node.domains ?? []),
				...(node.tags ?? []),
			].join('\u001f'),
		)
		.sort();
	const edgeParts = projection.edges
		.map((edge) =>
			[
				edge.id,
				edge.kind ?? 'relation',
				edge.semantic === false ? '0' : '1',
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

function readProjectionGroupSignature(state: WorkspaceState): string {
	if (
		!state.projection ||
		!state.grouping.groups.some((group) => group.mode === 'rule')
	)
		return '';
	const ownership = resolveChartGroupOwnership(
		state.projection.nodes,
		state.grouping,
	);
	return JSON.stringify(
		[...ownership.byNode]
			.map(([id, entry]) => [id, entry.groupId ?? null])
			.sort(([a], [b]) => (a ?? '').localeCompare(b ?? '')),
	);
}

function projectionStyleMatchesChanged(
	next: GraphProjection | undefined,
	previous: GraphProjection | undefined,
	rules: NodeStyleRule[],
): boolean {
	if (!next || !previous || next.nodes === previous.nodes) return false;
	const previousNodes = new Map(
		previous.nodes.map((node) => [node.id, node]),
	);
	return next.nodes.some((node) => {
		const old = previousNodes.get(node.id);
		return (
			old !== undefined &&
			(old.isEmpty !== node.isEmpty ||
				rules.some(
					(rule) =>
						rule.field !== 'all' &&
						rule.field !== 'group' &&
						matchesNodeCriterion(
							old,
							rule.field,
							rule.operator ?? 'is',
							rule.value,
						) !==
							matchesNodeCriterion(
								node,
								rule.field,
								rule.operator ?? 'is',
								rule.value,
							),
				))
		);
	});
}
