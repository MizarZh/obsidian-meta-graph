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
		nodeStyleRules: [],
		graphLinkStyleRules: [
			{
				id: 'default-graph-related',
				field: 'relation',
				value: 'related',
				color: '#3aa6b9',
				size: 1.5,
				label: '',
				hidden: false,
			},
		],
		flowLinkStyleRules: [
			{
				id: 'default-flow-related',
				field: 'relation',
				value: 'related',
				color: '#888888',
				size: 1,
				label: '',
				hidden: true,
			},
		],
		availableFolders: [],
		availableTags: [],
		availableDomains: [],
	};
}
