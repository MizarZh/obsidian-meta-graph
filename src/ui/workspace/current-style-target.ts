import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import type {
	KnowledgeNode,
	KnowledgeEdge,
	WorkspaceState,
} from '@/core/types';
import { isPlainLinkEdge, isUnresolvedLinkEdge } from '@/core/edge-kind';
import { matchesNodeRule, matchesLinkRule } from '@/graph/styles/style-rules';
import { resolveNodeStyleContext } from '@/graph/styles/node-style-context';

export interface StyleEditorRequest {
	key: string;
}

export function currentNodeStyleTarget(
	state: WorkspaceState,
	node: KnowledgeNode,
): string {
	const chartStyle = getActiveChartStyle(state);
	if (node.kind === 'unresolved') return 'Unresolved nodes';
	const context = resolveNodeStyleContext(node, state.grouping);
	for (const [scope, rules] of [
		['current', chartStyle.nodeRules],
		['global', state.globalNodeStyleRules],
	] as const) {
		for (const rule of [...rules].reverse())
			if (matchesNodeRule(node, rule, context))
				return `${scope}:${rule.id}`;
	}
	return Object.values(chartStyle.nodeOverrides).some(
		(value) => value !== undefined,
	)
		? 'Chart overrides'
		: 'workspace-default';
}

export function currentLinkStyleTarget(
	state: WorkspaceState,
	edge: KnowledgeEdge,
): string {
	const chartStyle = getActiveChartStyle(state);
	if (isUnresolvedLinkEdge(edge)) return 'Unresolved links';
	if (isPlainLinkEdge(edge)) return 'Plain links';
	for (const [scope, rules] of [
		['current', chartStyle.linkRules],
		['global', state.globalLinkStyleRules],
	] as const) {
		for (const rule of [...rules].reverse())
			if (matchesLinkRule(edge, rule)) return `${scope}:${rule.id}`;
	}
	return Object.values(chartStyle.linkOverrides).some(
		(value) => value !== undefined,
	)
		? 'Chart overrides'
		: 'workspace-default';
}
