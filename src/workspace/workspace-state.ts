import type {
	SavedWorkspaceState,
	WorkspaceState,
} from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import { cloneSerializable } from './workspace-persistence';

export function createWorkspaceState(
	maxNodes: number,
	fadeDistance = 1.5,
	savedState?: SavedWorkspaceState,
): WorkspaceState {
	const state: WorkspaceState = {
		mode: 'graph',
		flowEdgeStyle: 'orthogonal',
		flowDirection: 'LR',
		fadeDistance,
		graphSpacing: 1,
		flowSpacing: 1,
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
				lineStyle: 'solid',
				label: '',
				showLabel: false,
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
				lineStyle: 'solid',
				label: '',
				showLabel: false,
				hidden: true,
			},
		],
		availableFolders: [],
		availableTags: [],
		availableDomains: [],
	};
	return savedState
		? {
				...state,
				...cloneSerializable(savedState),
				query: {
					...state.query,
					...cloneSerializable(savedState.query),
					maxNodes,
				},
			}
		: state;
}
