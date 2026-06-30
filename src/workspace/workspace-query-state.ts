import type { GraphQuery, WorkspaceState } from '../core/types';
import { updateActiveChartState } from './workspace-state-updaters';

type QueryPatch = Partial<Omit<GraphQuery, 'roots'>>;

export function updateQueryInState(
	state: WorkspaceState,
	patch: QueryPatch,
): WorkspaceState {
	return updateActiveChartState(state, {
		query: { ...state.query, ...patch },
	});
}

export function updateGlobalQueryInState(
	state: WorkspaceState,
	patch: QueryPatch,
): WorkspaceState {
	return {
		...state,
		globalQuery: { ...state.globalQuery, ...patch, roots: [] },
	};
}
