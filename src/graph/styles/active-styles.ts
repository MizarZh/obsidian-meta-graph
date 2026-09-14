import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import type {
	DefaultLinkStyle,
	DefaultNodeStyle,
	LinkArrowStyle,
	LinkStyleRule,
	NodeStyleRule,
	WorkspaceState,
} from '@/core/types';
import {
	BUILT_IN_DEFAULT_NODE_STYLE,
	BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE,
} from '@/workspace/meta-graph/constants';

type ActiveLinkStyle = Omit<
	Required<DefaultLinkStyle>,
	'arrowStyle' | 'opacity' | 'arrowSize'
>;

export function getActiveNodeStyleRules(
	state: Pick<
		WorkspaceState,
		'globalNodeStyleRules' | 'charts' | 'activeChartId'
	>,
): NodeStyleRule[] {
	const chartStyle = getActiveChartStyle(state);
	return [...state.globalNodeStyleRules, ...chartStyle.nodeRules];
}

export function getActiveLinkStyleRules(
	state: Pick<
		WorkspaceState,
		'globalLinkStyleRules' | 'charts' | 'activeChartId'
	>,
): LinkStyleRule[] {
	const chartStyle = getActiveChartStyle(state);
	return [...state.globalLinkStyleRules, ...chartStyle.linkRules];
}

export function getActiveDefaultNodeStyle(
	state: Pick<
		WorkspaceState,
		'charts' | 'activeChartId' | 'defaultNodeStyle'
	>,
	fallbackColor: string,
): Required<DefaultNodeStyle> {
	const chartStyle = getActiveChartStyle(state);
	return {
		color:
			chartStyle.nodeOverrides.color ??
			state.defaultNodeStyle.color ??
			fallbackColor,
		size: chartStyle.nodeOverrides.size ?? state.defaultNodeStyle.size,
		opacity: clampNodeOpacity(
			chartStyle.nodeOverrides.opacity ??
				state.defaultNodeStyle.opacity ??
				BUILT_IN_DEFAULT_NODE_STYLE.opacity,
		),
		shape:
			chartStyle.nodeOverrides.shape ??
			state.defaultNodeStyle.shape ??
			BUILT_IN_DEFAULT_NODE_STYLE.shape,
	};
}

export function getActiveDefaultLinkStyle(
	state: Pick<
		WorkspaceState,
		'charts' | 'activeChartId' | 'defaultLinkStyle'
	>,
	fallbackColor: string,
): ActiveLinkStyle {
	const chartStyle = getActiveChartStyle(state);
	return {
		color:
			chartStyle.linkOverrides.color ??
			state.defaultLinkStyle.color ??
			fallbackColor,
		size: chartStyle.linkOverrides.size ?? state.defaultLinkStyle.size,
		lineStyle:
			chartStyle.linkOverrides.lineStyle ??
			state.defaultLinkStyle.lineStyle,
		label: chartStyle.linkOverrides.label ?? state.defaultLinkStyle.label,
		showLabel:
			chartStyle.linkOverrides.showLabel ??
			state.defaultLinkStyle.showLabel,
		hidden:
			chartStyle.linkOverrides.hidden ?? state.defaultLinkStyle.hidden,
	};
}

export function getActiveDefaultLinkArrowStyle(
	state: Pick<
		WorkspaceState,
		'charts' | 'activeChartId' | 'defaultLinkStyle'
	>,
): LinkArrowStyle {
	const chartStyle = getActiveChartStyle(state);
	return (
		chartStyle.linkOverrides.arrowStyle ??
		state.defaultLinkStyle.arrowStyle ??
		'filled'
	);
}

export function getActiveDefaultLinkOpacity(
	state: Pick<
		WorkspaceState,
		'charts' | 'activeChartId' | 'defaultLinkStyle'
	>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return (
		chartStyle.linkOverrides.opacity ?? state.defaultLinkStyle.opacity ?? 1
	);
}

export function getActiveDefaultLinkArrowSize(
	state: Pick<
		WorkspaceState,
		'charts' | 'activeChartId' | 'defaultLinkStyle'
	>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return (
		chartStyle.linkOverrides.arrowSize ??
		state.defaultLinkStyle.arrowSize ??
		1
	);
}

export function getActivePlainLinkArrowStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): LinkArrowStyle {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.plainLinkOverrides.arrowStyle ?? 'filled';
}

export function getActivePlainLinkOpacity(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.plainLinkOverrides.opacity ?? 1;
}

export function getActivePlainLinkArrowSize(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.plainLinkOverrides.arrowSize ?? 1;
}

export function getActivePlainLinkStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
	fallbackColor: string,
): ActiveLinkStyle {
	const chartStyle = getActiveChartStyle(state);
	return {
		color: chartStyle.plainLinkOverrides.color ?? fallbackColor,
		size: chartStyle.plainLinkOverrides.size ?? 1,
		lineStyle: chartStyle.plainLinkOverrides.lineStyle ?? 'dashed',
		label: '',
		showLabel: false,
		hidden: chartStyle.plainLinkOverrides.hidden ?? false,
	};
}

export function getActiveUnresolvedNodeStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
	fallbackColor: string,
): Required<DefaultNodeStyle> {
	const chartStyle = getActiveChartStyle(state);
	return {
		color: chartStyle.unresolvedNodeOverrides.color ?? fallbackColor,
		size: chartStyle.unresolvedNodeOverrides.size ?? 6,
		opacity: clampNodeOpacity(
			chartStyle.unresolvedNodeOverrides.opacity ??
				BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE.opacity,
		),
		shape:
			chartStyle.unresolvedNodeOverrides.shape ??
			BUILT_IN_DEFAULT_UNRESOLVED_NODE_STYLE.shape,
	};
}

function clampNodeOpacity(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function getActiveUnresolvedLinkStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
	fallbackColor: string,
): ActiveLinkStyle {
	const chartStyle = getActiveChartStyle(state);
	return {
		color: chartStyle.unresolvedLinkOverrides.color ?? fallbackColor,
		size: chartStyle.unresolvedLinkOverrides.size ?? 1,
		lineStyle: chartStyle.unresolvedLinkOverrides.lineStyle ?? 'dashed',
		label: '',
		showLabel: false,
		hidden: chartStyle.unresolvedLinkOverrides.hidden ?? false,
	};
}

export function getActiveUnresolvedLinkArrowStyle(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): LinkArrowStyle {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.unresolvedLinkOverrides.arrowStyle ?? 'filled';
}

export function getActiveUnresolvedLinkOpacity(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.unresolvedLinkOverrides.opacity ?? 1;
}

export function getActiveUnresolvedLinkArrowSize(
	state: Pick<WorkspaceState, 'charts' | 'activeChartId'>,
): number {
	const chartStyle = getActiveChartStyle(state);
	return chartStyle.unresolvedLinkOverrides.arrowSize ?? 1;
}
