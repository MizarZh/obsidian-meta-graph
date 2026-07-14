import type { GraphQuery, WorkspaceState } from '../../core/types';
import { normalizeTags } from '../../core/tags';
import { updateActiveChartState } from './state-updaters';

type QueryPatch = Partial<Omit<GraphQuery, 'roots'>>;

export function updateQueryInState(
	state: WorkspaceState,
	patch: QueryPatch,
): WorkspaceState {
	const normalizedPatch = normalizeQueryPatch(patch);
	return updateActiveChartState(state, {
		query: { ...state.query, ...normalizedPatch },
	});
}

export function updateGlobalQueryInState(
	state: WorkspaceState,
	patch: QueryPatch,
): WorkspaceState {
	const normalizedPatch = normalizeQueryPatch(patch);
	return {
		...state,
		globalQuery: { ...state.globalQuery, ...normalizedPatch, roots: [] },
	};
}

function normalizeQueryPatch(patch: QueryPatch): QueryPatch {
	return patch.tags ? { ...patch, tags: normalizeTags(patch.tags) } : patch;
}
