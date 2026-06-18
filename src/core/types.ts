export type NodeId = string;
export type EdgeId = string;

export type RelationType = 'prerequisite' | 'leads-to' | 'related';

export interface KnowledgeNode {
	id: NodeId;
	path: string;
	title: string;
	folder: string;
	domains: string[];
	tags: string[];
	noteType?: string;
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

export interface GraphQuery {
	roots: NodeId[];
	folders: string[];
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

export type ViewMode = 'graph' | 'flow';
export type FlowEdgeStyle = 'straight' | 'orthogonal';

export interface WorkspaceState {
	mode: ViewMode;
	flowEdgeStyle: FlowEdgeStyle;
	layoutRevision: number;
	currentNoteId?: NodeId;
	selectedNodeId?: NodeId;
	hoveredNodeId?: NodeId;
	query: GraphQuery;
	projection?: GraphProjection;
	availableFolders: string[];
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
