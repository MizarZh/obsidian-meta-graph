import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	LinkStyleRule,
	NodeStyleRule,
	WorkspaceState,
} from '../../core/types';

export function getActiveNodeStyleRules(
	state: Pick<WorkspaceState, 'globalNodeStyleRules' | 'nodeStyleRules'>,
): NodeStyleRule[] {
	return [...state.globalNodeStyleRules, ...state.nodeStyleRules];
}

export function getActiveLinkStyleRules(
	state: Pick<WorkspaceState, 'globalLinkStyleRules' | 'linkStyleRules'>,
): LinkStyleRule[] {
	return [...state.globalLinkStyleRules, ...state.linkStyleRules];
}

export function getActiveDefaultNodeStyle(
	state: Pick<WorkspaceState, 'nodeStyleOverrides' | 'defaultNodeStyle'>,
	fallbackColor: string,
): Required<DefaultNodeStyle> {
	return {
		color:
			state.nodeStyleOverrides.color ??
			state.defaultNodeStyle.color ??
			fallbackColor,
		size: state.nodeStyleOverrides.size ?? state.defaultNodeStyle.size,
	};
}

export function getActiveDefaultLinkStyle(
	state: Pick<WorkspaceState, 'linkStyleOverrides' | 'defaultLinkStyle'>,
	fallbackColor: string,
): Required<DefaultLinkStyle> {
	return {
		color:
			state.linkStyleOverrides.color ??
			state.defaultLinkStyle.color ??
			fallbackColor,
		size: state.linkStyleOverrides.size ?? state.defaultLinkStyle.size,
		lineStyle:
			state.linkStyleOverrides.lineStyle ??
			state.defaultLinkStyle.lineStyle,
		label: state.linkStyleOverrides.label ?? state.defaultLinkStyle.label,
		showLabel:
			state.linkStyleOverrides.showLabel ??
			state.defaultLinkStyle.showLabel,
		hidden:
			state.linkStyleOverrides.hidden ?? state.defaultLinkStyle.hidden,
	};
}
