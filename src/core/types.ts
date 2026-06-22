export type NodeId = string;
export type EdgeId = string;

export type RelationType = string;

export interface KnowledgeNode {
	id: NodeId;
	path: string;
	title: string;
	aliases?: string[];
	folder: string;
	domains: string[];
	tags: string[];
	noteType?: string;
	metadataFields?: string[];
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
export type NodeFilterField = 'folder' | 'tag';
export type NodeFilterAction = 'show' | 'hide';

export interface NodeFilterRule {
	id: string;
	action: NodeFilterAction;
	field: NodeFilterField;
	value: string;
}

export interface GraphQuery {
	roots: NodeId[];
	folders: string[];
	tags: string[];
	hiddenNodeRules: NodeFilterRule[];
	domains: string[];
	relations: RelationType[];
	depth: number;
	direction: DirectionMode;
	maxNodes: number;
}

export interface GraphProjection {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	rootIds: Set<NodeId>;
}

export type ViewMode = 'graph' | 'flow' | 'arc';
export type FlowEdgeStyle = 'straight' | 'orthogonal';
export type FlowDirection = 'LR' | 'RL' | 'TD' | 'DT';
export type ArcDirection = 'right' | 'left' | 'up' | 'down';
export type ChartType = ViewMode;
export type NodeStyleField =
	| 'all'
	| 'folder'
	| 'tag'
	| 'domain'
	| 'type'
	| 'title';
export type LinkStyleField = 'all' | 'relation' | 'source-field';
export type LinkLineStyle = 'solid' | 'dashed' | 'dotted';

export interface NodeStyleRule {
	id: string;
	field: NodeStyleField;
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
	showInspector: boolean;
	showFilters: boolean;
}

export interface ChartStyleConfig {
	nodeRules: NodeStyleRule[];
	linkRules: LinkStyleRule[];
}

export interface MetaGraphChart {
	id: string;
	name: string;
	type: ChartType;
	query: GraphQuery;
	layout: ChartLayoutConfig;
	display: ChartDisplayConfig;
	style: ChartStyleConfig;
}

export interface MetaGraphDocument {
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
}

export interface WorkspaceState {
	charts: MetaGraphChart[];
	activeChartId: string;
	mode: ViewMode;
	flowEdgeStyle: FlowEdgeStyle;
	flowDirection: FlowDirection;
	arcDirection: ArcDirection;
	fadeDistance: number;
	graphSpacing: number;
	flowSpacing: number;
	arcSpacing: number;
	layoutRevision: number;
	currentNoteId?: NodeId;
	selectedNodeId?: NodeId;
	hoveredNodeId?: NodeId;
	query: GraphQuery;
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
		projection?: Omit<GraphProjection, 'rootIds'> & {
			rootIds: NodeId[];
		};
	};
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	renderer: RendererDebugState;
}
