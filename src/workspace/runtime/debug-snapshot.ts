import type {
	DebugSnapshot,
	KnowledgeIndex,
	MetadataDebugEntry,
	RendererDebugState,
	UnresolvedLink,
	WorkspacePerformanceSnapshot,
	WorkspaceState,
} from '../../core/types';

export interface WorkspaceDebugSnapshotInput {
	state: WorkspaceState;
	index?: KnowledgeIndex;
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	rendererDebugState: RendererDebugState;
	performance?: WorkspacePerformanceSnapshot;
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
		performance: input.performance ?? {
			index: {
				fullBuildCount: 0,
				incrementalBuildCount: 0,
				lastChangedFileCount: 0,
				markdownFileCount: 0,
				largeVaultMode: 'auto',
				largeVaultModeActive: false,
			},
			samples: [],
		},
	};
}

function mapSetsToRecord(
	map: Map<string, Set<string>> | undefined,
): Record<string, string[]> {
	return Object.fromEntries(
		[...(map?.entries() ?? [])].map(([key, values]) => [key, [...values]]),
	);
}
