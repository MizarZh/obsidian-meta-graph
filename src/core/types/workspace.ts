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
export type SettingsPanelMode =
	| 'graph'
	| 'workspace'
	| 'filters'
	| 'groups'
	| 'text-style'
	| 'note-style'
	| 'link-style';
export type FlowEdgeStyle = 'straight' | 'orthogonal';
export type FlowDirection = 'LR' | 'RL' | 'TD' | 'DT';
export type ArcDirection = 'right' | 'left' | 'up' | 'down';
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
export type ChartType = ViewMode;
export type ConnectionFieldMode = 'directed' | 'bidirectional' | 'reverse';

export interface ConnectionFieldSpec {
	id: string;
	field: string;
	mode: ConnectionFieldMode;
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
	arcDirection?: ArcDirection;
	nodeSort?: LayoutNodeSort;
	nodeSortDirection?: LayoutSortDirection;
	edgeStyle?: FlowEdgeStyle;
	manual?: ManualLayoutConfig;
}

export type ChartGroupMode = 'manual' | 'rule';

export interface NodePlacement {
	x: number;
	y: number;
	groupId?: string;
}

export interface ChartGroup {
	id: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
	mode: ChartGroupMode;
	padding: number;
	rule?: NodeFilterGroup;
}

export interface ManualLayoutConfig {
	nodes: Record<NodeId, NodePlacement>;
	groups: ChartGroup[];
}

export interface ChartDisplayConfig {
	fadeDistance: number;
	labelSize: number;
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

export interface MetaGraphChart {
	id: string;
	name: string;
	type: ChartType;
	source: ChartSource;
	query: GraphQuery;
	curated: CuratedWorkspaceConfig;
	layout: ChartLayoutConfig;
	display: ChartDisplayConfig;
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
	arcDirection: ArcDirection;
	nodeSort: LayoutNodeSort;
	nodeSortDirection: LayoutSortDirection;
	fadeDistance: number;
	labelSize: number;
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
	arcSpacing: number;
	manualLayout: ManualLayoutConfig;
	layoutRevision: number;
	currentNoteId?: NodeId;
	selectedNodeId?: NodeId;
	hoveredNodeId?: NodeId;
	query: GraphQuery;
	curated: CuratedWorkspaceConfig;
	globalQuery: GraphQuery;
	defaultNodeStyle: Required<DefaultNodeStyle>;
	defaultLinkStyle: Required<DefaultLinkStyle>;
	globalNodeStyleRules: NodeStyleRule[];
	globalLinkStyleRules: LinkStyleRule[];
	nodeStyleOverrides: DefaultNodeStyle;
	linkStyleOverrides: DefaultLinkStyle;
	plainLinkStyleOverrides: DefaultLinkStyle;
	nodeStyleRules: NodeStyleRule[];
	linkStyleRules: LinkStyleRule[];
	connectionFields: string[];
	connectionFieldSpecs: ConnectionFieldSpec[];
	connectionFieldModes: Record<string, ConnectionFieldMode>;
	activeConnectionFieldSpecId: string;
	activeConnectionField: string;
	connectionUndoCount: number;
	dock: MetaGraphDock;
	projection?: GraphProjection;
	availableFolders: string[];
	availableTags: string[];
	availableDomains: string[];
}
