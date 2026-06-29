import type { GraphProjection, WorkspaceState } from '../../core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
} from '../../graph/active-styles';
import {
	GraphologyAdapter,
	type GraphPosition,
	type RuntimeGraph,
} from '../../graph/graphology-adapter';
import type { GraphPalette } from '../../graph/graph-styles';

export function createWorkspaceRuntimeGraph(
	projection: GraphProjection,
	positions: ReadonlyMap<string, GraphPosition>,
	state: WorkspaceState,
	palette: GraphPalette,
): RuntimeGraph {
	return new GraphologyAdapter(
		palette,
		getActiveDefaultNodeStyle(state, palette.node),
		getActiveDefaultLinkStyle(state, palette.edge),
		getActiveNodeStyleRules(state),
		getActiveLinkStyleRules(state),
	).fromProjection(projection, positions);
}
