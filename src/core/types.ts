export type NodeId = string;
export type EdgeId = string;

export type RelationType = string;

export interface KnowledgeNode {
	id: NodeId;
	path: string;
	title: string;
	fileName?: string;
	extension?: string;
	fileSize?: number;
	createdTime?: number;
	modifiedTime?: number;
	aliases?: string[];
	folder: string;
	domains: string[];
	tags: string[];
	links?: string[];
	embeds?: string[];
	noteType?: string;
	metadataFields?: string[];
	metadata?: Record<string, unknown>;
}

export interface KnowledgeEdge {
	id: EdgeId;
	source: NodeId;
	target: NodeId;
	relation: RelationType;
	directed: boolean;
	sourcePath: string;
	sourceField: string;
}

export interface KnowledgeIndex {
	nodes: Map<NodeId, KnowledgeNode>;
	edges: Map<EdgeId, KnowledgeEdge>;
	outgoing: Map<NodeId, Set<EdgeId>>;
	incoming: Map<NodeId, Set<EdgeId>>;
}

export interface UnresolvedLink {
	linkText: string;
	sourcePath: string;
}

export interface MetadataDebugEntry {
	path: string;
	relationProperties: Record<string, unknown>;
	frontmatterLinks: Array<{
		key: string;
		link: string;
		original: string;
	}>;
}

export interface RendererDebugState {
	status: 'idle' | 'waiting-for-size' | 'layout' | 'rendered' | 'error';
	mode?: ViewMode;
	container?: {
		width: number;
		height: number;
	};
	runtimeGraph?: {
		nodeCount: number;
		edgeCount: number;
		nodes: Array<{
			id: string;
			x: number;
			y: number;
			label: string;
		}>;
		edges: Array<{
			id: string;
			source: string;
			target: string;
			type: string;
			hidden: boolean;
		}>;
	};
	error?: string;
}

export type DirectionMode = 'incoming' | 'outgoing' | 'both';
export type NodeFilterField =
	| 'file.file'
	| 'file.name'
	| 'file.basename'
	| 'file.fullname'
	| 'file.path'
	| 'file.folder'
	| 'file.ext'
	| 'file.ctime'
	| 'file.mtime'
	| 'file.size'
	| 'file.links'
	| 'file.embeds'
	| 'file.tags'
	| 'aliases'
	| 'metadata-field'
	| 'folder'
	| 'tag'
	| `metadata.${string}`;
export type NodeFilterAction = 'show' | 'hide';
export type NodeFilterOperator =
	| 'has-value'
	| 'empty'
	| 'is'
	| 'is-not'
	| 'contains'
	| 'does-not-contain'
	| 'links-to'
	| 'in-folder'
	| 'has-tag'
	| 'has-property'
	| 'does-not-link-to'
	| 'is-not-in-folder'
	| 'does-not-have-tag'
	| 'does-not-have-property'
	| 'starts-with'
	| 'ends-with'
	| 'is-empty'
	| 'is-not-empty'
	| 'contains-any-of'
	| 'contains-all-of'
	| 'does-not-start-with'
	| 'does-not-end-with'
	| 'does-not-contain-any-of'
	| 'does-not-contain-all-of'
	| 'on'
	| 'not-on'
	| 'before'
	| 'on-or-before'
	| 'after'
	| 'on-or-after'
	| 'eq'
	| 'neq'
	| 'lt'
	| 'lte'
	| 'gt'
	| 'gte'
	| 'is-exactly'
	| 'is-not-exactly';

export interface NodeFilterRule {
	id: string;
	action: NodeFilterAction;
	field: NodeFilterField;
	operator?: NodeFilterOperator;
	value: string;
}

export type NodeFilterGroupMode = 'all' | 'any' | 'none';

export interface NodeFilterCondition {
	id: string;
	kind: 'condition';
	field: NodeFilterField;
	operator?: NodeFilterOperator;
	value: string;
}

export interface NodeFilterGroup {
	id: string;
	kind: 'group';
	mode: NodeFilterGroupMode;
	children: NodeFilterItem[];
}

export type NodeFilterItem = NodeFilterCondition | NodeFilterGroup;

export interface GraphQuery {
	roots: NodeId[];
	folders: string[];
	tags: string[];
	hiddenNodeRules: NodeFilterRule[];
	filterRoot?: NodeFilterGroup;
	domains: string[];
	relations: RelationType[];
	depth: number;
	direction: DirectionMode;
	maxNodes: number;
	showIsolatedNodes: boolean;
}

export interface GraphProjection {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	rootIds: Set<NodeId>;
	primaryIds?: Set<NodeId>;
	contextIds?: Set<NodeId>;
}

export type ViewMode = 'graph' | 'flow' | 'arc';
export type ChartSource = 'query' | 'curated';
export type SettingsPanelMode =
	| 'graph'
	| 'workspace'
	| 'filters'
	| 'text-style'
	| 'note-style'
	| 'link-style';
export type FlowEdgeStyle = 'straight' | 'orthogonal';
export type FlowDirection = 'LR' | 'RL' | 'TD' | 'DT';
export type ArcDirection = 'right' | 'left' | 'up' | 'down';
export type LabelPosition = 'right' | 'left' | 'top' | 'bottom';
export type ChartType = ViewMode;
export type NodeStyleField =
	| 'all'
	| 'folder'
	| 'tag'
	| 'file.name'
	| 'file.basename'
	| 'file.path'
	| 'file.folder'
	| 'file.ext'
	| 'file.links'
	| 'file.tags'
	| 'metadata-field'
	| 'domain'
	| 'type'
	| 'title';
export type LinkStyleField = 'all' | 'relation' | 'source-field';
export type LinkLineStyle = 'solid' | 'dashed' | 'dotted';

export interface NodeStyleRule {
	id: string;
	field: NodeStyleField;
	operator?: NodeFilterOperator;
	value: string;
	color: string;
	size: number;
}

export interface LinkStyleRule {
	id: string;
	field: LinkStyleField;
	value: string;
	color: string;
	size: number;
	lineStyle: LinkLineStyle;
	label: string;
	showLabel: boolean;
	hidden: boolean;
}

export interface ChartLayoutConfig {
	engine: 'force-atlas' | 'elk' | 'arc';
	spacing: number;
	direction?: FlowDirection;
	arcDirection?: ArcDirection;
	edgeStyle?: FlowEdgeStyle;
}

export interface ChartDisplayConfig {
	fadeDistance: number;
	labelSize: number;
	labelPosition: LabelPosition;
	labelColor: string;
	labelBackgroundOpacity: number;
	showInspector: boolean;
	showFilters: boolean;
}

export interface ChartStyleConfig {
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface GlobalStyleConfig {
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface CuratedWorkspaceFile {
	path: NodeId;
	group?: string;
	note?: string;
	x?: number;
	y?: number;
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
	activeConnectionField: string;
	dock: MetaGraphDock;
}

export type DockConnectionDirection =
	| 'from-graph-to-dock'
	| 'from-dock-to-graph';

export interface DockTemplateNode {
	id: string;
	label: string;
	templatePath: string;
	targetFolder: string;
	relationField: string;
	direction: DockConnectionDirection;
}

export interface DockNoteNode {
	id: string;
	path: NodeId;
}

export interface MetaGraphDock {
	templates: DockTemplateNode[];
	notes: DockNoteNode[];
	dockWidth: number;
	curatedPanelWidth: number;
	focusOnSelect: boolean;
}

export interface WorkspaceState {
	charts: MetaGraphChart[];
	activeChartId: string;
	mode: ViewMode;
	chartSource: ChartSource;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
	arcDirection: ArcDirection;
	fadeDistance: number;
	labelSize: number;
	labelPosition: LabelPosition;
	labelColor: string;
	labelBackgroundOpacity: number;
	graphSpacing: number;
	flowSpacing: number;
	arcSpacing: number;
	layoutRevision: number;
	currentNoteId?: NodeId;
	selectedNodeId?: NodeId;
	hoveredNodeId?: NodeId;
	query: GraphQuery;
	curated: CuratedWorkspaceConfig;
	globalQuery: GraphQuery;
	globalNodeStyleRules: NodeStyleRule[];
	globalLinkStyleRules: LinkStyleRule[];
	nodeStyleRules: NodeStyleRule[];
	linkStyleRules: LinkStyleRule[];
	connectionFields: string[];
	activeConnectionField: string;
	connectionUndoCount: number;
	dock: MetaGraphDock;
	projection?: GraphProjection;
	availableFolders: string[];
	availableTags: string[];
	availableDomains: string[];
}

export interface DebugSnapshot {
	generatedAt: string;
	index: {
		nodeCount: number;
		edgeCount: number;
		nodes: KnowledgeNode[];
		edges: KnowledgeEdge[];
		outgoing: Record<NodeId, EdgeId[]>;
		incoming: Record<NodeId, EdgeId[]>;
	};
	state: Omit<WorkspaceState, 'projection'> & {
		projection?: Omit<GraphProjection, 'rootIds' | 'primaryIds' | 'contextIds'> & {
			rootIds: NodeId[];
			primaryIds?: NodeId[];
			contextIds?: NodeId[];
		};
	};
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	renderer: RendererDebugState;
}
