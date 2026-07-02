export type NodeId = string;
export type EdgeId = string;

export type RelationType = string;
export type KnowledgeNodeKind = 'note' | 'unresolved';
export type KnowledgeEdgeKind = 'relation' | 'plain-link' | 'unresolved-link';

export interface KnowledgeNode {
	id: NodeId;
	kind?: KnowledgeNodeKind;
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
	kind?: KnowledgeEdgeKind;
	semantic?: boolean;
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
	showPlainLinks: boolean;
	showUnresolvedLinks: boolean;
}

export interface GraphProjection {
	nodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	rootIds: Set<NodeId>;
	primaryIds?: Set<NodeId>;
	contextIds?: Set<NodeId>;
	hiddenNodeIds?: Set<NodeId>;
}
