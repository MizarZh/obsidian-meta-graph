import type { WorkspaceState } from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';

export function createWorkspaceState(maxNodes: number): WorkspaceState {
	return {
		mode: 'graph',
		flowEdgeStyle: 'orthogonal',
		flowDirection: 'LR',
		layoutRevision: 0,
		query: {
			...DEFAULT_GRAPH_QUERY,
			relations: [...DEFAULT_GRAPH_QUERY.relations],
			maxNodes,
		},
		availableFolders: [],
		availableDomains: [],
	};
}
