import type {
	DebugSnapshot,
	KnowledgeIndex,
	MetadataDebugEntry,
	RendererDebugState,
	UnresolvedLink,
	WorkspaceState,
} from '../../core/types';

export interface WorkspaceDebugSnapshotInput {
	state: WorkspaceState;
	index?: KnowledgeIndex;
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	rendererDebugState: RendererDebugState;
	generatedAt?: string;
}

export function createWorkspaceDebugSnapshot(
	input: WorkspaceDebugSnapshotInput,
): DebugSnapshot {
	return {
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		index: {
			nodeCount: input.index?.nodes.size ?? 0,
			edgeCount: input.index?.edges.size ?? 0,
			nodes: [...(input.index?.nodes.values() ?? [])],
			edges: [...(input.index?.edges.values() ?? [])],
			outgoing: mapSetsToRecord(input.index?.outgoing),
			incoming: mapSetsToRecord(input.index?.incoming),
		},
		state: {
			...input.state,
			projection: input.state.projection
				? {
						...input.state.projection,
						rootIds: [...input.state.projection.rootIds],
						primaryIds: input.state.projection.primaryIds
							? [...input.state.projection.primaryIds]
							: undefined,
						contextIds: input.state.projection.contextIds
							? [...input.state.projection.contextIds]
							: undefined,
					}
				: undefined,
		},
		unresolvedLinks: input.unresolvedLinks,
		metadataSources: input.metadataSources,
		renderer: input.rendererDebugState,
	};
}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
