import {
	getNetworkLayout,
	getFlowLayout,
	isStableNetworkEnabled,
} from '@/ui/workspace/graph-settings';
import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import type {
	ArcDirection,
	ArcLabelAngle,
	ChartGroup,
	ChartGroupingConfig,
	ChartStyleConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	FlowDirection,
	FlowEdgeStyle,
	FlowRelationRule,
	GraphQuery,
	KnowledgeNode,
	LabelPosition,
	LayoutNodeSort,
	LayoutSortDirection,
	LinkStyleRule,
	ManualLayoutConfig,
	NodeStyleRule,
	PlanarRendererKind,
	ThreeLabelResolution,
	ViewMode,
	WorkspaceState,
} from '@/core/types';
import type { WorkspaceController } from '@/workspace/workspace-controller';

export interface WorkspaceSettingsSuggestions {
	folders: string[];
	tags: string[];
	metadataFields: string[];
	metadataFieldTypes: Record<string, string>;
	metadataFieldValues: Record<string, string[]>;
	filePaths: string[];
	flowRelationFields: string[];
	groups: WorkspaceState['grouping']['groups'];
}

export interface WorkspaceGraphSettingsView {
	timelineEnabled: boolean;
	nodeBadges: import('@/core/types').NodeBadgeSettings;
	showLegend: boolean;
	showMinimap: boolean;
	showTrace: boolean;
	overlayLayout: import('@/core/types/overlay').OverlayLayout;
	mode: ViewMode;
	renderer: PlanarRendererKind;
	fadeDistance: number;
	labelDensity: number;
	cubeFaceOpacity: number;
	parallelEdgeStyle?: 'straight' | 'curve';
	cubeSize: number;
	cubeFreeCamera: boolean;
	flowLayout: import('@/core/types').FlowLayoutKind;
	networkLayout: import('@/core/types').NetworkLayoutKind;
	stableLayout: boolean;
	enableForceLayout: boolean;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
	flowCornerRadius: number;
	flowRelationRules: FlowRelationRule[];
	flowRelationConflictCount: number;
	arcDirection: ArcDirection;
	nodeSort: LayoutNodeSort;
	nodeSortDirection: LayoutSortDirection;
	graphCenterForce: number;
	graphRepelForce: number;
	graphLinkForce: number;
	graphDragLinkForce: number;
	graphReturnForce: number;
	graphLinkDistance: number;
	flowLayerSpacing: number;
	flowLaneSpacing: number;
	arcSpacing: number;
	query: GraphQuery;
}

export interface WorkspaceLabelSettingsView {
	mode: ViewMode;
	labelSize: number;
	scaleLabelsWithZoom: boolean;
	threeLabelResolution: ThreeLabelResolution;
	labelBold: boolean;
	labelItalic: boolean;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelMaxWidth: number;
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
	forceLabels: boolean;
	arcLabelAngle: ArcLabelAngle;
}

export interface WorkspaceQuerySettingsView {
	canExpand: boolean;
	coreCount: number;
	contextCount: number;
	currentQuery: GraphQuery;
	globalQuery: GraphQuery;
}

export interface WorkspaceStyleSettingsView {
	chart: ChartStyleConfig;
	defaultNode: Required<DefaultNodeStyle>;
	defaultLink: Required<DefaultLinkStyle>;
	globalNodeRules: NodeStyleRule[];
	nodeOverrides: DefaultNodeStyle;
	unresolvedNodeOverrides: DefaultNodeStyle;
	nodeRules: NodeStyleRule[];
	globalLinkRules: LinkStyleRule[];
	linkOverrides: DefaultLinkStyle;
	plainLinkOverrides: DefaultLinkStyle;
	unresolvedLinkOverrides: DefaultLinkStyle;
	linkRules: LinkStyleRule[];
}

export interface WorkspaceGroupSettingsView {
	grouping: ChartGroupingConfig;
	manualLayout: ManualLayoutConfig;
	nodes: KnowledgeNode[];
	folders: string[];
	mode: ViewMode;
	forceLayoutEnabled: boolean;
}

export interface WorkspaceSettingsView {
	graph: WorkspaceGraphSettingsView;
	labels: WorkspaceLabelSettingsView;
	query: WorkspaceQuerySettingsView;
	styles: WorkspaceStyleSettingsView;
	suggestions: WorkspaceSettingsSuggestions;
	groups: WorkspaceGroupSettingsView;
}

type QueryPatch = Partial<Omit<GraphQuery, 'roots'>>;
type StyleRuleScope = 'global' | 'current';

export interface WorkspaceGraphSettingsActions {
	setTimelineEnabled(value: boolean): void;
	setNodeBadges(value: import('@/core/types').NodeBadgeSettings): void;
	setShowLegend(value: boolean): void;
	setShowMinimap(value: boolean): void;
	setShowTrace(value: boolean): void;
	setOverlayLayout(value: import('@/core/types/overlay').OverlayLayout): void;
	setRenderer(value: PlanarRendererKind): void;
	setFlowEdgeStyle(value: FlowEdgeStyle): void;
	setParallelEdgeStyle(value: 'straight' | 'curve'): void;
	setFlowDirection(value: FlowDirection): void;
	setFlowCornerRadius(value: number): void;
	setFlowRelationRules(value: FlowRelationRule[]): void;
	setArcDirection(value: ArcDirection): void;
	setLayoutNodeSort(value: LayoutNodeSort): void;
	setLayoutSortDirection(value: LayoutSortDirection): void;
	setFadeDistance(value: number): void;
	setLabelDensity(value: number): void;
	setCubeFaceOpacity(value: number): void;
	setCubeSize(value: number): void;
	setCubeFreeCamera(value: boolean): void;
	setFlowLayout(value: import('@/core/types').FlowLayoutKind): void;
	setNetworkLayout(value: import('@/core/types').NetworkLayoutKind): void;
	setStableLayout(value: boolean): void;
	setEnableForceLayout(value: boolean): void;
	setGraphCenterForce(value: number): void;
	setGraphRepelForce(value: number): void;
	setGraphLinkForce(value: number): void;
	setGraphDragLinkForce(value: number): void;
	setGraphReturnForce(value: number): void;
	setGraphLinkDistance(value: number): void;
	resetGraphForces(): void;
	setFlowLayerSpacing(value: number): void;
	setFlowLaneSpacing(value: number): void;
	setArcSpacing(value: number): void;
	updateQuery(value: QueryPatch): void;
}

export interface WorkspaceLabelSettingsActions {
	setLabelSize(value: number): void;
	setScaleLabelsWithZoom(value: boolean): void;
	setThreeLabelResolution(value: ThreeLabelResolution): void;
	setLabelBold(value: boolean): void;
	setLabelItalic(value: boolean): void;
	setLabelPosition(value: LabelPosition): void;
	setLabelOffset(value: number): void;
	setLabelMaxWidth(value: number): void;
	setLabelLightTextColor(value: string): void;
	setLabelLightBackgroundColor(value: string): void;
	setLabelLightBackgroundOpacity(value: number): void;
	setLabelDarkTextColor(value: string): void;
	setLabelDarkBackgroundColor(value: string): void;
	setLabelDarkBackgroundOpacity(value: number): void;
	setForceLabels(value: boolean): void;
	setArcLabelAngle(value: ArcLabelAngle): void;
}

export interface WorkspaceQuerySettingsActions {
	updateCurrent(value: QueryPatch): void;
	updateGlobal(value: QueryPatch): void;
}

export interface WorkspaceStyleSettingsActions {
	setChart(value: ChartStyleConfig): void;
	setDefaultNode(value: Required<DefaultNodeStyle>): void;
	setDefaultLink(value: Required<DefaultLinkStyle>): void;
	setGlobalNodeRules(value: NodeStyleRule[]): void;
	setNodeOverrides(value: DefaultNodeStyle): void;
	setUnresolvedNodeOverrides(value: DefaultNodeStyle): void;
	setNodeRules(value: NodeStyleRule[]): void;
	setGlobalLinkRules(value: LinkStyleRule[]): void;
	setLinkOverrides(value: DefaultLinkStyle): void;
	setPlainLinkOverrides(value: DefaultLinkStyle): void;
	setUnresolvedLinkOverrides(value: DefaultLinkStyle): void;
	setLinkRules(value: LinkStyleRule[]): void;
	moveNodeRule(id: string, targetScope: StyleRuleScope): void;
	moveLinkRule(id: string, targetScope: StyleRuleScope): void;
}

export interface WorkspaceGroupSettingsActions {
	add(): void;
	update(groupId: string, patch: Partial<ChartGroup>): void;
	delete(groupId: string): void;
	reorder(groupId: string, offset: number): void;
}

export interface WorkspaceSettingsActions {
	graph: WorkspaceGraphSettingsActions;
	labels: WorkspaceLabelSettingsActions;
	query: WorkspaceQuerySettingsActions;
	styles: WorkspaceStyleSettingsActions;
	groups: WorkspaceGroupSettingsActions;
}

export interface WorkspaceSettingsSuggestionInput {
	metadataFields: string[];
	metadataFieldTypes: Record<string, string>;
	metadataFieldValues: Record<string, string[]>;
	filePaths: string[];
}

export function createWorkspaceSettingsView(
	state: WorkspaceState,
	suggestionInput: WorkspaceSettingsSuggestionInput,
): WorkspaceSettingsView {
	const chartStyle = getActiveChartStyle(state);
	return {
		graph: {
			timelineEnabled: state.timeline.enabled,
			nodeBadges: state.nodeBadges,
			showLegend: state.showLegend,
			showMinimap: state.showMinimap,
			showTrace: state.showTrace,
			overlayLayout: state.overlayLayout,
			mode: state.mode,
			renderer: state.renderer,
			fadeDistance: state.fadeDistance,
			labelDensity: state.labelDensity,
			cubeFaceOpacity: state.cubeFaceOpacity,
			parallelEdgeStyle: state.parallelEdgeStyle ?? 'straight',
			cubeSize: state.cubeSize,
			cubeFreeCamera: state.cubeFreeCamera,
			stableLayout: isStableNetworkEnabled(state),
			networkLayout: getNetworkLayout(state),
			flowLayout: getFlowLayout(state),
			enableForceLayout: state.enableForceLayout,
			flowEdgeStyle: state.flowEdgeStyle,
			flowDirection: state.flowDirection,
			flowCornerRadius: state.flowCornerRadius,
			flowRelationRules: state.flowRelationRules,
			flowRelationConflictCount: state.flowRelationConflictCount,
			arcDirection: state.arcDirection,
			nodeSort: state.nodeSort,
			nodeSortDirection: state.nodeSortDirection,
			graphCenterForce: state.graphCenterForce,
			graphRepelForce: state.graphRepelForce,
			graphLinkForce: state.graphLinkForce,
			graphDragLinkForce: state.graphDragLinkForce,
			graphReturnForce: state.graphReturnForce,
			graphLinkDistance: state.graphLinkDistance,
			flowLayerSpacing: state.flowLayerSpacing,
			flowLaneSpacing: state.flowLaneSpacing,
			arcSpacing: state.arcSpacing,
			query: state.query,
		},
		labels: {
			mode: state.mode,
			labelSize: state.labelSize,
			scaleLabelsWithZoom: state.scaleLabelsWithZoom,
			threeLabelResolution: state.threeLabelResolution,
			labelBold: state.labelBold,
			labelItalic: state.labelItalic,
			labelPosition: state.labelPosition,
			labelOffset: state.labelOffset,
			labelMaxWidth: state.labelMaxWidth,
			labelLightTextColor: state.labelLightTextColor,
			labelLightBackgroundColor: state.labelLightBackgroundColor,
			labelLightBackgroundOpacity: state.labelLightBackgroundOpacity,
			labelDarkTextColor: state.labelDarkTextColor,
			labelDarkBackgroundColor: state.labelDarkBackgroundColor,
			labelDarkBackgroundOpacity: state.labelDarkBackgroundOpacity,
			forceLabels: state.forceLabels,
			arcLabelAngle: state.arcLabelAngle,
		},
		query: {
			canExpand: state.chartSource !== 'curated',
			coreCount:
				(state.projection?.nodes.length ?? 0) -
				(state.projection?.contextIds?.size ?? 0),
			contextCount: state.projection?.contextIds?.size ?? 0,
			currentQuery: state.query,
			globalQuery: state.globalQuery,
		},
		styles: {
			chart: chartStyle,
			defaultNode: state.defaultNodeStyle,
			defaultLink: state.defaultLinkStyle,
			globalNodeRules: state.globalNodeStyleRules,
			nodeOverrides: chartStyle.nodeOverrides,
			unresolvedNodeOverrides: chartStyle.unresolvedNodeOverrides,
			nodeRules: chartStyle.nodeRules,
			globalLinkRules: state.globalLinkStyleRules,
			linkOverrides: chartStyle.linkOverrides,
			plainLinkOverrides: chartStyle.plainLinkOverrides,
			unresolvedLinkOverrides: chartStyle.unresolvedLinkOverrides,
			linkRules: chartStyle.linkRules,
		},
		suggestions: {
			folders: state.availableFolders,
			tags: state.availableTags,
			metadataFields: suggestionInput.metadataFields,
			metadataFieldTypes: suggestionInput.metadataFieldTypes,
			metadataFieldValues: suggestionInput.metadataFieldValues,
			filePaths: suggestionInput.filePaths,
			flowRelationFields: [...new Set(state.connectionFields)],
			groups: state.grouping.groups,
		},
		groups: {
			grouping: state.grouping,
			manualLayout: state.manualLayout,
			nodes: state.projection?.nodes ?? [],
			folders: state.availableFolders,
			mode: state.mode,
			forceLayoutEnabled: state.enableForceLayout,
		},
	};
}

export function createWorkspaceSettingsActions(
	controller: WorkspaceController,
): WorkspaceSettingsActions {
	return {
		graph: {
			setRenderer: (value) => controller.setActiveChartRenderer(value),
			setNodeBadges: (value) => controller.setNodeBadges(value),
			setShowLegend: (value) => controller.setShowLegend(value),
			setShowMinimap: (value) => controller.setShowMinimap(value),
			setShowTrace: (value) => controller.setShowTrace(value),
			setOverlayLayout: (value) => controller.setOverlayLayout(value),
			setTimelineEnabled: (value) =>
				controller.setTimeline({ enabled: value }),
			resetGraphForces: () => controller.resetGraphForces(),
			setFlowEdgeStyle: (value) => controller.setFlowEdgeStyle(value),
			setParallelEdgeStyle: (value) =>
				controller.setParallelEdgeStyle(value),
			setFlowDirection: (value) => controller.setFlowDirection(value),
			setFlowCornerRadius: (value) =>
				controller.setFlowCornerRadius(value),
			setFlowRelationRules: (value) =>
				controller.setFlowRelationRules(value),
			setArcDirection: (value) => controller.setArcDirection(value),
			setLayoutNodeSort: (value) => controller.setLayoutNodeSort(value),
			setLayoutSortDirection: (value) =>
				controller.setLayoutSortDirection(value),
			setFadeDistance: (value) => controller.setFadeDistance(value),
			setLabelDensity: (value) => controller.setLabelDensity(value),
			setCubeFaceOpacity: (value) => controller.setCubeFaceOpacity(value),
			setCubeSize: (value) => controller.setCubeSize(value),
			setCubeFreeCamera: (value) => controller.setCubeFreeCamera(value),
			setStableLayout: (value) => controller.setStableLayout(value),
			setNetworkLayout: (value) => controller.setNetworkLayout(value),
			setFlowLayout: (value) => controller.setFlowLayout(value),
			setEnableForceLayout: (value) =>
				controller.setEnableForceLayout(value),
			setGraphCenterForce: (value) =>
				controller.setGraphCenterForce(value),
			setGraphRepelForce: (value) => controller.setGraphRepelForce(value),
			setGraphLinkForce: (value) => controller.setGraphLinkForce(value),
			setGraphDragLinkForce: (value) =>
				controller.setGraphDragLinkForce(value),
			setGraphReturnForce: (value) =>
				controller.setGraphReturnForce(value),
			setGraphLinkDistance: (value) =>
				controller.setGraphLinkDistance(value),
			setFlowLayerSpacing: (value) =>
				controller.setFlowLayerSpacing(value),
			setFlowLaneSpacing: (value) => controller.setFlowLaneSpacing(value),
			setArcSpacing: (value) => controller.setArcSpacing(value),
			updateQuery: (value) => controller.updateQuery(value),
		},
		labels: {
			setLabelSize: (value) => controller.setLabelSize(value),
			setScaleLabelsWithZoom: (value) =>
				controller.setScaleLabelsWithZoom(value),
			setThreeLabelResolution: (value) =>
				controller.setThreeLabelResolution(value),
			setLabelBold: (value) => controller.setLabelBold(value),
			setLabelItalic: (value) => controller.setLabelItalic(value),
			setLabelPosition: (value) => controller.setLabelPosition(value),
			setLabelOffset: (value) => controller.setLabelOffset(value),
			setLabelMaxWidth: (value) => controller.setLabelMaxWidth(value),
			setLabelLightTextColor: (value) =>
				controller.setLabelLightTextColor(value),
			setLabelLightBackgroundColor: (value) =>
				controller.setLabelLightBackgroundColor(value),
			setLabelLightBackgroundOpacity: (value) =>
				controller.setLabelLightBackgroundOpacity(value),
			setLabelDarkTextColor: (value) =>
				controller.setLabelDarkTextColor(value),
			setLabelDarkBackgroundColor: (value) =>
				controller.setLabelDarkBackgroundColor(value),
			setLabelDarkBackgroundOpacity: (value) =>
				controller.setLabelDarkBackgroundOpacity(value),
			setForceLabels: (value) => controller.setForceLabels(value),
			setArcLabelAngle: (value) => controller.setArcLabelAngle(value),
		},
		query: {
			updateCurrent: (value) => controller.updateQuery(value),
			updateGlobal: (value) => controller.updateGlobalQuery(value),
		},
		styles: {
			setChart: (value) => controller.setChartStyle(value),
			setDefaultNode: (value) => controller.setDefaultNodeStyle(value),
			setDefaultLink: (value) => controller.setDefaultLinkStyle(value),
			setGlobalNodeRules: (value) =>
				controller.setGlobalNodeStyleRules(value),
			setNodeOverrides: (value) =>
				controller.setNodeStyleOverrides(value),
			setUnresolvedNodeOverrides: (value) =>
				controller.setUnresolvedNodeStyleOverrides(value),
			setNodeRules: (value) => controller.setNodeStyleRules(value),
			setGlobalLinkRules: (value) =>
				controller.setGlobalLinkStyleRules(value),
			setLinkOverrides: (value) =>
				controller.setLinkStyleOverrides(value),
			setPlainLinkOverrides: (value) =>
				controller.setPlainLinkStyleOverrides(value),
			setUnresolvedLinkOverrides: (value) =>
				controller.setUnresolvedLinkStyleOverrides(value),
			setLinkRules: (value) => controller.setLinkStyleRules(value),
			moveNodeRule: (id, targetScope) =>
				controller.moveNodeStyleRuleToScope(id, targetScope),
			moveLinkRule: (id, targetScope) =>
				controller.moveLinkStyleRuleToScope(id, targetScope),
		},
		groups: {
			add: () => controller.addGroup(),
			update: (groupId, patch) => controller.updateGroup(groupId, patch),
			delete: (groupId) => controller.deleteGroup(groupId),
			reorder: (groupId, direction) =>
				controller.reorderGroup(groupId, direction),
		},
	};
}
