import type {
	SavedWorkspaceState,
	WorkspaceState,
} from '../core/types';

export function serializeWorkspaceState(
	state: WorkspaceState,
): SavedWorkspaceState {
	return cloneSerializable({
		mode: state.mode,
		flowEdgeStyle: state.flowEdgeStyle,
		flowDirection: state.flowDirection,
		fadeDistance: state.fadeDistance,
		graphSpacing: state.graphSpacing,
		flowSpacing: state.flowSpacing,
		query: state.query,
		nodeStyleRules: state.nodeStyleRules,
		graphLinkStyleRules: state.graphLinkStyleRules,
		flowLinkStyleRules: state.flowLinkStyleRules,
	});
}

export function cloneSerializable<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
