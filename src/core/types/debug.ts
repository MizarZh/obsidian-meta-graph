import type {
	EdgeId,
	GraphProjection,
	KnowledgeEdge,
	KnowledgeNode,
	NodeId,
	UnresolvedLink,
} from './graph';
import type { ViewMode, WorkspaceState } from './workspace';

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
		projection?: Omit<
			GraphProjection,
			'rootIds' | 'primaryIds' | 'contextIds'
		> & {
			rootIds: NodeId[];
			primaryIds?: NodeId[];
			contextIds?: NodeId[];
		};
	};
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	renderer: RendererDebugState;
}
