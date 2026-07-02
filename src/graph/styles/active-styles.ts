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

export function getActivePlainLinkStyle(
	state: Pick<WorkspaceState, 'plainLinkStyleOverrides'>,
	fallbackColor: string,
): Required<DefaultLinkStyle> {
	return {
		color: state.plainLinkStyleOverrides.color ?? fallbackColor,
		size: state.plainLinkStyleOverrides.size ?? 1,
		lineStyle: state.plainLinkStyleOverrides.lineStyle ?? 'dashed',
		label: '',
		showLabel: false,
		hidden: state.plainLinkStyleOverrides.hidden ?? false,
	};
}

export function getActiveUnresolvedNodeStyle(
	state: Pick<WorkspaceState, 'unresolvedNodeStyleOverrides'>,
	fallbackColor: string,
): Required<DefaultNodeStyle> {
	return {
		color: state.unresolvedNodeStyleOverrides.color ?? fallbackColor,
		size: state.unresolvedNodeStyleOverrides.size ?? 6,
	};
}

export function getActiveUnresolvedLinkStyle(
	state: Pick<WorkspaceState, 'unresolvedLinkStyleOverrides'>,
	fallbackColor: string,
): Required<DefaultLinkStyle> {
	return {
		color: state.unresolvedLinkStyleOverrides.color ?? fallbackColor,
		size: state.unresolvedLinkStyleOverrides.size ?? 1,
		lineStyle: state.unresolvedLinkStyleOverrides.lineStyle ?? 'dotted',
		label: '',
		showLabel: false,
		hidden: state.unresolvedLinkStyleOverrides.hidden ?? false,
	};
}
