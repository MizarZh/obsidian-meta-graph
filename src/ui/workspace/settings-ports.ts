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
	ThreeLabelResolution,
	ViewMode,
	WorkspaceState,
} from '../../core/types';
import type { WorkspaceController } from '../../workspace/workspace-controller';

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
	mode: ViewMode;
	fadeDistance: number;
	labelDensity: number;
	cubeFaceOpacity: number;
	cubeSize: number;
	cubeFreeCamera: boolean;
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
	setFlowEdgeStyle(value: FlowEdgeStyle): void;
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
	setEnableForceLayout(value: boolean): void;
	setGraphCenterForce(value: number): void;
	setGraphRepelForce(value: number): void;
	setGraphLinkForce(value: number): void;
	setGraphDragLinkForce(value: number): void;
	setGraphReturnForce(value: number): void;
	setGraphLinkDistance(value: number): void;
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
	reorder(groupId: string, direction: -1 | 1): void;
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
	return {
		graph: {
			mode: state.mode,
			fadeDistance: state.fadeDistance,
			labelDensity: state.labelDensity,
			cubeFaceOpacity: state.cubeFaceOpacity,
			cubeSize: state.cubeSize,
			cubeFreeCamera: state.cubeFreeCamera,
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
			currentQuery: state.query,
			globalQuery: state.globalQuery,
		},
		styles: {
			chart: {
				nodeOverrides: state.nodeStyleOverrides,
				unresolvedNodeOverrides: state.unresolvedNodeStyleOverrides,
				linkOverrides: state.linkStyleOverrides,
				plainLinkOverrides: state.plainLinkStyleOverrides,
				unresolvedLinkOverrides: state.unresolvedLinkStyleOverrides,
				nodeRules: state.nodeStyleRules,
				linkRules: state.linkStyleRules,
			},
			defaultNode: state.defaultNodeStyle,
			defaultLink: state.defaultLinkStyle,
			globalNodeRules: state.globalNodeStyleRules,
			nodeOverrides: state.nodeStyleOverrides,
			unresolvedNodeOverrides: state.unresolvedNodeStyleOverrides,
			nodeRules: state.nodeStyleRules,
			globalLinkRules: state.globalLinkStyleRules,
			linkOverrides: state.linkStyleOverrides,
			plainLinkOverrides: state.plainLinkStyleOverrides,
			unresolvedLinkOverrides: state.unresolvedLinkStyleOverrides,
			linkRules: state.linkStyleRules,
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
			setFlowEdgeStyle: (value) => controller.setFlowEdgeStyle(value),
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
