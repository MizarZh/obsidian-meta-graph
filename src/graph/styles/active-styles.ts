import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	LinkArrowStyle,
	LinkStyleRule,
	NodeStyleRule,
	WorkspaceState,
} from '../../core/types';
import {
	BUILT_IN_DEFAULT_NODE_STYLE,
	BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE,
} from '../../workspace/meta-graph/constants';

type ActiveLinkStyle = Omit<
	Required<DefaultLinkStyle>,
	'arrowStyle' | 'opacity' | 'arrowSize'
>;

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
		opacity: clampNodeOpacity(
			state.nodeStyleOverrides.opacity ??
			state.defaultNodeStyle.opacity ??
			BUILT_IN_DEFAULT_NODE_STYLE.opacity,
		),
		shape:
			state.nodeStyleOverrides.shape ??
			state.defaultNodeStyle.shape ??
			BUILT_IN_DEFAULT_NODE_STYLE.shape,
	};
}

export function getActiveDefaultLinkStyle(
	state: Pick<WorkspaceState, 'linkStyleOverrides' | 'defaultLinkStyle'>,
	fallbackColor: string,
): ActiveLinkStyle {
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

export function getActiveDefaultLinkArrowStyle(
	state: Pick<WorkspaceState, 'linkStyleOverrides' | 'defaultLinkStyle'>,
): LinkArrowStyle {
	return (
		state.linkStyleOverrides.arrowStyle ??
		state.defaultLinkStyle.arrowStyle ??
		'filled'
	);
}

export function getActiveDefaultLinkOpacity(
	state: Pick<WorkspaceState, 'linkStyleOverrides' | 'defaultLinkStyle'>,
): number {
	return (
		state.linkStyleOverrides.opacity ?? state.defaultLinkStyle.opacity ?? 1
	);
}

export function getActiveDefaultLinkArrowSize(
	state: Pick<WorkspaceState, 'linkStyleOverrides' | 'defaultLinkStyle'>,
): number {
	return (
		state.linkStyleOverrides.arrowSize ??
		state.defaultLinkStyle.arrowSize ??
		1
	);
}

export function getActivePlainLinkArrowStyle(
	state: Pick<WorkspaceState, 'plainLinkStyleOverrides'>,
): LinkArrowStyle {
	return state.plainLinkStyleOverrides.arrowStyle ?? 'filled';
}

export function getActivePlainLinkOpacity(
	state: Pick<WorkspaceState, 'plainLinkStyleOverrides'>,
): number {
	return state.plainLinkStyleOverrides.opacity ?? 1;
}

export function getActivePlainLinkArrowSize(
	state: Pick<WorkspaceState, 'plainLinkStyleOverrides'>,
): number {
	return state.plainLinkStyleOverrides.arrowSize ?? 1;
}

export function getActivePlainLinkStyle(
	state: Pick<WorkspaceState, 'plainLinkStyleOverrides'>,
	fallbackColor: string,
): ActiveLinkStyle {
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
		opacity: clampNodeOpacity(
			state.unresolvedNodeStyleOverrides.opacity ??
			BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE.opacity,
		),
		shape:
			state.unresolvedNodeStyleOverrides.shape ??
			BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE.shape,
	};
}

function clampNodeOpacity(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function getActiveUnresolvedLinkStyle(
	state: Pick<WorkspaceState, 'unresolvedLinkStyleOverrides'>,
	fallbackColor: string,
): ActiveLinkStyle {
	return {
		color: state.unresolvedLinkStyleOverrides.color ?? fallbackColor,
		size: state.unresolvedLinkStyleOverrides.size ?? 1,
		lineStyle: state.unresolvedLinkStyleOverrides.lineStyle ?? 'dotted',
		label: '',
		showLabel: false,
		hidden: state.unresolvedLinkStyleOverrides.hidden ?? false,
	};
}

export function getActiveUnresolvedLinkArrowStyle(
	state: Pick<WorkspaceState, 'unresolvedLinkStyleOverrides'>,
): LinkArrowStyle {
	return state.unresolvedLinkStyleOverrides.arrowStyle ?? 'filled';
}

export function getActiveUnresolvedLinkOpacity(
	state: Pick<WorkspaceState, 'unresolvedLinkStyleOverrides'>,
): number {
	return state.unresolvedLinkStyleOverrides.opacity ?? 1;
}

export function getActiveUnresolvedLinkArrowSize(
	state: Pick<WorkspaceState, 'unresolvedLinkStyleOverrides'>,
): number {
	return state.unresolvedLinkStyleOverrides.arrowSize ?? 1;
}
