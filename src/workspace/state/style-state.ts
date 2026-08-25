import type {
	ChartStyleConfig,
	DefaultLinkStyle,
	DefaultNodeStyle,
	LinkStyleRule,
	MetaGraphChart,
	NodeStyleRule,
	WorkspaceState,
} from '../../core/types';
import {
	normalizeGlobalLinkStyleRules,
	normalizeGlobalNodeStyleRules,
	normalizeLinkStyleRules,
	normalizeNodeStyleRules,
	normalizePlainLinkStyleOverrides,
	normalizeUnresolvedNodeStyleOverrides,
	normalizeUnresolvedLinkStyleOverrides,
} from '../meta-graph-model';
import { cloneSerializable } from './persistence';
import { updateActiveChartState } from './state-updaters';

type ChartStyleKey = keyof MetaGraphChart['style'];

export function setGlobalNodeStyleRulesInState(
	state: WorkspaceState,
	nodeStyleRules: NodeStyleRule[],
): WorkspaceState {
	return {
		...state,
		globalNodeStyleRules: normalizeGlobalNodeStyleRules(nodeStyleRules),
	};
}

export function setGlobalLinkStyleRulesInState(
	state: WorkspaceState,
	linkStyleRules: LinkStyleRule[],
): WorkspaceState {
	return {
		...state,
		globalLinkStyleRules: normalizeGlobalLinkStyleRules(linkStyleRules),
	};
}

export function setDefaultNodeStyleInState(
	state: WorkspaceState,
	defaultNodeStyle: Required<DefaultNodeStyle>,
): WorkspaceState {
	return {
		...state,
		defaultNodeStyle: cloneSerializable(defaultNodeStyle),
	};
}

export function setDefaultLinkStyleInState(
	state: WorkspaceState,
	defaultLinkStyle: Required<DefaultLinkStyle>,
): WorkspaceState {
	return {
		...state,
		defaultLinkStyle: cloneSerializable(defaultLinkStyle),
	};
}

export function setNodeStyleOverridesInState(
	state: WorkspaceState,
	nodeStyleOverrides: DefaultNodeStyle,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		nodeOverrides: cloneSerializable(nodeStyleOverrides),
	});
}

export function setUnresolvedNodeStyleOverridesInState(
	state: WorkspaceState,
	unresolvedNodeStyleOverrides: DefaultNodeStyle,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		unresolvedNodeOverrides: normalizeUnresolvedNodeStyleOverrides(
			unresolvedNodeStyleOverrides,
		),
	});
}

export function setLinkStyleOverridesInState(
	state: WorkspaceState,
	linkStyleOverrides: DefaultLinkStyle,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		linkOverrides: cloneSerializable(linkStyleOverrides),
	});
}

export function setPlainLinkStyleOverridesInState(
	state: WorkspaceState,
	plainLinkStyleOverrides: DefaultLinkStyle,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		plainLinkOverrides: normalizePlainLinkStyleOverrides(
			plainLinkStyleOverrides,
		),
	});
}

export function setUnresolvedLinkStyleOverridesInState(
	state: WorkspaceState,
	unresolvedLinkStyleOverrides: DefaultLinkStyle,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		unresolvedLinkOverrides: normalizeUnresolvedLinkStyleOverrides(
			unresolvedLinkStyleOverrides,
		),
	});
}

export function setNodeStyleRulesInState(
	state: WorkspaceState,
	nodeStyleRules: NodeStyleRule[],
): WorkspaceState {
	return updateActiveChartStyle(state, {
		nodeRules: normalizeNodeStyleRules(nodeStyleRules),
	});
}

export function setLinkStyleRulesInState(
	state: WorkspaceState,
	linkStyleRules: LinkStyleRule[],
): WorkspaceState {
	return updateActiveChartStyle(state, {
		linkRules: normalizeLinkStyleRules(linkStyleRules),
	});
}

export function setChartStyleInState(
	state: WorkspaceState,
	style: ChartStyleConfig,
): WorkspaceState {
	return updateActiveChartStyle(state, {
		nodeOverrides: cloneSerializable(style.nodeOverrides),
		unresolvedNodeOverrides: normalizeUnresolvedNodeStyleOverrides(
			style.unresolvedNodeOverrides,
		),
		linkOverrides: cloneSerializable(style.linkOverrides),
		plainLinkOverrides: normalizePlainLinkStyleOverrides(
			style.plainLinkOverrides,
		),
		unresolvedLinkOverrides: normalizeUnresolvedLinkStyleOverrides(
			style.unresolvedLinkOverrides,
		),
		nodeRules: normalizeNodeStyleRules(style.nodeRules),
		linkRules: normalizeLinkStyleRules(style.linkRules),
	});
}

export type StyleRuleTargetScope = 'global' | 'current';

export function moveNodeStyleRuleToScopeInState(
	state: WorkspaceState,
	id: string,
	targetScope: StyleRuleTargetScope,
): WorkspaceState {
	const sourceRules =
		targetScope === 'global'
			? state.nodeStyleRules
			: state.globalNodeStyleRules;
	const rule = sourceRules.find((item) => item.id === id);
	if (!rule) {
		return state;
	}
	const nextSourceRules = sourceRules.filter((item) => item.id !== id);
	const nextTargetRules = [
		...(targetScope === 'global'
			? state.globalNodeStyleRules
			: state.nodeStyleRules),
		rule,
	];
	if (targetScope === 'global') {
		const nextState = setNodeStyleRulesInState(state, nextSourceRules);
		return setGlobalNodeStyleRulesInState(nextState, nextTargetRules);
	}
	const nextState = setGlobalNodeStyleRulesInState(state, nextSourceRules);
	return setNodeStyleRulesInState(nextState, nextTargetRules);
}

export function moveLinkStyleRuleToScopeInState(
	state: WorkspaceState,
	id: string,
	targetScope: StyleRuleTargetScope,
): WorkspaceState {
	const sourceRules =
		targetScope === 'global'
			? state.linkStyleRules
			: state.globalLinkStyleRules;
	const rule = sourceRules.find((item) => item.id === id);
	if (!rule) {
		return state;
	}
	const nextSourceRules = sourceRules.filter((item) => item.id !== id);
	const nextTargetRules = [
		...(targetScope === 'global'
			? state.globalLinkStyleRules
			: state.linkStyleRules),
		rule,
	];
	if (targetScope === 'global') {
		const nextState = setLinkStyleRulesInState(state, nextSourceRules);
		return setGlobalLinkStyleRulesInState(nextState, nextTargetRules);
	}
	const nextState = setGlobalLinkStyleRulesInState(state, nextSourceRules);
	return setLinkStyleRulesInState(nextState, nextTargetRules);
}

function updateActiveChartStyle(
	state: WorkspaceState,
	patch: Partial<Pick<MetaGraphChart['style'], ChartStyleKey>>,
): WorkspaceState {
	const chart = getActiveChart(state);
	return updateActiveChartState(state, {
		style: {
			...chart.style,
			...patch,
		},
	});
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}
