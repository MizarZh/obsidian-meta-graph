import type { MetaGraphDock } from './dock';
import type {
	GraphProjection,
	GraphQuery,
	NodeFilterGroup,
	NodeId,
} from './graph';
import type {
	ChartStyleConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	GlobalStyleConfig,
	LinkStyleRule,
	NodeStyleRule,
} from './style';

export type ViewMode =
	| 'graph'
	| 'graph-3d'
	| 'cube'
	| 'free'
	| 'flow'
	| 'arc'
	| 'hierarchical-edge-bundling';
export type ChartSource = 'query' | 'curated';
export interface CreateChartInput {
	type: ViewMode;
	source: ChartSource;
	name: string;
}
export type ThreeLabelResolution = 'standard' | 'high' | 'ultra';
export type SettingsPanelMode =
	| 'graph'
	| 'workspace'
	| 'filters'
	| 'groups'
	| 'text-style'
	| 'note-style'
	| 'link-style';
export type FlowEdgeStyle = 'straight' | 'curve' | 'orthogonal' | 'bundled';
export type FlowDirection = 'LR' | 'RL' | 'TD' | 'DT';
export type FlowRelationPlacement = 'default' | 'before' | 'after' | 'parallel';
export interface FlowRelationRule {
	id: string;
	field: string;
	placement: FlowRelationPlacement;
}
export type ArcDirection = 'right' | 'left' | 'up' | 'down';
export type ArcLabelAngle = 'auto' | 0 | 45 | 90;
export type LayoutNodeSort =
	| 'name'
	| 'path'
	| 'folder'
	| 'type'
	| 'tag'
	| 'domain'
	| 'created'
	| 'modified'
	| 'degree'
	| 'in-degree'
	| 'out-degree';
export type LayoutSortDirection = 'asc' | 'desc';
export type LabelPosition =
	'auto' | 'right' | 'left' | 'top' | 'bottom' | 'center';
export type NodeOpenMode = 'tab' | 'right-split';
export type ChartType = ViewMode;
export type ConnectionFieldMode =
	'directed' | 'bidirectional' | 'reverse' | 'paired';

export interface ConnectionFieldSpec {
	id: string;
	field: string;
	mode: ConnectionFieldMode;
	reverseField?: string;
}

export interface ChartLayoutConfig {
	engine:
		| 'force-atlas'
		| 'force-3d'
		| 'cube-3d'
		| 'free'
		| 'elk'
		| 'arc'
		| 'hierarchical-edge-bundling';
	spacing: number;
	centerForce?: number;
	repelForce?: number;
	linkForce?: number;
	dragLinkForce?: number;
	returnForce?: number;
	linkDistance?: number;
	layerSpacing?: number;
	laneSpacing?: number;
	direction?: FlowDirection;
	flowRelationRules?: FlowRelationRule[];
	arcDirection?: ArcDirection;
	arcLabelAngle?: ArcLabelAngle;
	nodeSort?: LayoutNodeSort;
	nodeSortDirection?: LayoutSortDirection;
	edgeStyle?: FlowEdgeStyle;
	cornerRadius?: number;
	manual?: ManualLayoutConfig;
}

export type ChartGroupMode = 'manual' | 'rule';
export type ChartGroupShape = 'auto' | 'circle' | 'rectangle';

export interface ChartGroupDefinition {
	id: string;
	name: string;
	color: string;
	mode: ChartGroupMode;
	shape?: ChartGroupShape;
	padding: number;
	rule?: NodeFilterGroup;
}

export interface ChartGroupingConfig {
	groups: ChartGroupDefinition[];
	overrides: Record<NodeId, string | null>;
}

export interface NodePlacement {
	x: number;
	y: number;
	groupId?: string;
}

export interface GroupFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ChartGroup extends ChartGroupDefinition, GroupFrame {}

export interface ManualLayoutConfig {
	nodes: Record<NodeId, NodePlacement>;
	/** Cube faces and legacy Free groups. Free geometry uses groupFrames. */
	groups: ChartGroup[];
	groupFrames?: Record<string, GroupFrame>;
}

export interface ChartDisplayConfig {
	fadeDistance: number;
	labelSize: number;
	scaleLabelsWithZoom: boolean;
	threeLabelResolution: ThreeLabelResolution;
	labelBold: boolean;
	labelItalic: boolean;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelColor: string;
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
	labelBackgroundOpacity: number;
	labelDensity: number;
	cubeFaceOpacity: number;
	cubeSize: number;
	cubeFreeCamera: boolean;
	forceLabels: boolean;
	enableForceLayout: boolean;
	showInspector: boolean;
	showFilters: boolean;
}

export interface CuratedWorkspaceFile {
	path: NodeId;
	note?: string;
	hidden?: boolean;
	x?: number;
	y?: number;
	groupId?: string;
}

export interface CuratedWorkspaceContext {
	enabled: boolean;
	depth: number;
	includeOutgoingLinks: boolean;
	includeBacklinks: boolean;
	includeMetadataRelations: boolean;
}

export interface CuratedWorkspaceConfig {
	files: CuratedWorkspaceFile[];
	context: CuratedWorkspaceContext;
}

export interface ChartPresentationConfig {
	showInspector: boolean;
	showFilters: boolean;
	dockWidth: number;
	curatedPanelWidth: number;
	focusOnSelect: boolean;
}

export interface ChartTemplateOverride {
	defaultGroupId: string;
}

export interface MetaGraphChart {
	id: string;
	name: string;
	type: ChartType;
	source: ChartSource;
	query: GraphQuery;
	curated: CuratedWorkspaceConfig;
	grouping: ChartGroupingConfig;
	layout: ChartLayoutConfig;
	display: ChartDisplayConfig;
	presentation: ChartPresentationConfig;
	templateOverrides: Record<string, ChartTemplateOverride>;
	style: ChartStyleConfig;
}

export interface MetaGraphDocument {
	globalQuery: GraphQuery;
	globalStyle: GlobalStyleConfig;
	charts: MetaGraphChart[];
	activeChart: string;
	connectionFields: string[];
	connectionFieldSpecs: ConnectionFieldSpec[];
	connectionFieldModes: Record<string, ConnectionFieldMode>;
	activeConnectionFieldSpecId: string;
	activeConnectionField: string;
	dock: MetaGraphDock;
}

export interface WorkspaceState {
	charts: MetaGraphChart[];
	activeChartId: string;
	mode: ViewMode;
	chartSource: ChartSource;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
	flowRelationRules: FlowRelationRule[];
	flowRelationConflictCount: number;
	arcDirection: ArcDirection;
	arcLabelAngle: ArcLabelAngle;
	nodeSort: LayoutNodeSort;
	nodeSortDirection: LayoutSortDirection;
	fadeDistance: number;
	labelSize: number;
	scaleLabelsWithZoom: boolean;
	threeLabelResolution: ThreeLabelResolution;
	labelBold: boolean;
	labelItalic: boolean;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelColor: string;
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
	labelBackgroundOpacity: number;
	labelDensity: number;
	cubeFaceOpacity: number;
	cubeSize: number;
	cubeFreeCamera: boolean;
	forceLabels: boolean;
	enableForceLayout: boolean;
	graphSpacing: number;
	graphCenterForce: number;
	graphRepelForce: number;
	graphLinkForce: number;
	graphDragLinkForce: number;
	graphReturnForce: number;
	graphLinkDistance: number;
	flowSpacing: number;
	flowLayerSpacing: number;
	flowLaneSpacing: number;
	flowCornerRadius: number;
	arcSpacing: number;
	grouping: ChartGroupingConfig;
	manualLayout: ManualLayoutConfig;
	layoutRevision: number;
	currentNoteId?: NodeId;
	selectedNodeId?: NodeId;
	selectedEdgeId?: string;
	selectedGroupId?: string;
	hoveredNodeId?: NodeId;
	query: GraphQuery;
	curated: CuratedWorkspaceConfig;
	globalQuery: GraphQuery;
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	globalNodeStyleRules: NodeStyleRule[];
	globalLinkStyleRules: LinkStyleRule[];
	nodeStyleOverrides: DefaultNodeStyle;
	unresolvedNodeStyleOverrides: DefaultNodeStyle;
	linkStyleOverrides: DefaultLinkStyle;
	plainLinkStyleOverrides: DefaultLinkStyle;
	unresolvedLinkStyleOverrides: DefaultLinkStyle;
	nodeStyleRules: NodeStyleRule[];
	linkStyleRules: LinkStyleRule[];
	connectionFields: string[];
	connectionFieldSpecs: ConnectionFieldSpec[];
	connectionFieldModes: Record<string, ConnectionFieldMode>;
	activeConnectionFieldSpecId: string;
	activeConnectionField: string;
	connectionUndoCount: number;
	connectionRedoCount: number;
	dock: MetaGraphDock;
	projection?: GraphProjection;
	availableFolders: string[];
	availableTags: string[];
	availableDomains: string[];
}
