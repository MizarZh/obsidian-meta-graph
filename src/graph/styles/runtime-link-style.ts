import type {
	DefaultLinkStyle,
	KnowledgeEdge,
	LinkStyleRule,
} from '@/core/types';
import { isPlainLinkEdge, isUnresolvedLinkEdge } from '@/core/edge-kind';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import {
	resolveLinkVisualStyle,
	type LinkVisualStyle,
} from '@/graph/styles/style-rules';

export function resolveRuntimeLinkStyle(
	edge: KnowledgeEdge,
	linkRules: LinkStyleRule[],
	defaultLinkStyle: Required<DefaultLinkStyle>,
	plainLinkStyle: Required<DefaultLinkStyle>,
	unresolvedLinkStyle: Required<DefaultLinkStyle>,
	palette: GraphPalette,
): LinkVisualStyle & { forceLabel: boolean } {
	const specialStyle = isUnresolvedLinkEdge(edge)
		? unresolvedLinkStyle
		: isPlainLinkEdge(edge)
			? plainLinkStyle
			: undefined;
	const resolvedStyle = specialStyle
		? {
				color: specialStyle.color,
				size: specialStyle.size,
				lineStyle: specialStyle.lineStyle,
				label: '',
				hidden: specialStyle.hidden,
				arrowStyle: specialStyle.arrowStyle,
				opacity: specialStyle.opacity,
				arrowSize: specialStyle.arrowSize,
			}
		: resolveLinkVisualStyle(edge, linkRules, {
				color: defaultLinkStyle.color || palette.edge,
				size: defaultLinkStyle.size,
				lineStyle: defaultLinkStyle.lineStyle,
				label: defaultLinkStyle.showLabel
					? defaultLinkStyle.label || edge.relation
					: '',
				hidden: defaultLinkStyle.hidden,
				arrowStyle: defaultLinkStyle.arrowStyle,
				opacity: defaultLinkStyle.opacity,
				arrowSize: defaultLinkStyle.arrowSize,
			});
	return {
		color: resolvedStyle.color,
		size: resolvedStyle.size,
		hidden: resolvedStyle.hidden,
		label: resolvedStyle.label,
		forceLabel: Boolean(resolvedStyle.label),
		lineStyle: resolvedStyle.lineStyle,
		arrowStyle: resolvedStyle.arrowStyle,
		opacity: resolvedStyle.opacity,
		arrowSize: resolvedStyle.arrowSize,
	};
}
