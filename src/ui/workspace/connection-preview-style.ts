import type {
	ConnectionFieldMode,
	KnowledgeEdge,
	LinkArrowStyle,
	WorkspaceState,
} from '../../core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultLinkArrowSize,
	getActiveLinkStyleRules,
	getActiveDefaultLinkArrowStyle,
	getActiveDefaultLinkOpacity,
} from '../../graph/styles/active-styles';
import {
	resolveLinkStyle,
	resolveLinkArrowStyle,
	resolveLinkArrowSize,
	resolveLinkOpacity,
	type LinkStyle,
} from '../../graph/styles/style-rules';

export interface ConnectionPreviewMarkers {
	start: boolean;
	end: boolean;
}

export function resolveConnectionPreviewMarkers(
	mode: ConnectionFieldMode,
): ConnectionPreviewMarkers {
	if (mode === 'bidirectional' || mode === 'paired') {
		return { start: true, end: true };
	}
	if (mode === 'reverse') {
		return { start: true, end: false };
	}
	return { start: false, end: true };
}

export function resolveConnectionPreviewStyle(
	state: WorkspaceState,
	sourceNodeId: string,
	targetNodeId = sourceNodeId,
): LinkStyle & {
	arrowStyle: LinkArrowStyle;
	opacity: number;
	arrowSize: number;
} {
	const field = state.activeConnectionField.trim();
	const defaults = getActiveDefaultLinkStyle(state, 'var(--text-muted)');
	const edge: KnowledgeEdge = {
		id: '__connection-preview__',
		kind: 'relation',
		semantic: true,
		source: sourceNodeId,
		target: targetNodeId,
		relation: field,
		directed: true,
		sourcePath: sourceNodeId,
		sourceField: field,
	};

	const rules = getActiveLinkStyleRules(state);
	const style = resolveLinkStyle(edge, rules, {
		color: defaults.color,
		size: defaults.size,
		lineStyle: defaults.lineStyle,
		label: defaults.showLabel ? defaults.label || field : '',
		hidden: defaults.hidden,
	});
	return {
		...style,
		arrowStyle: resolveLinkArrowStyle(
			edge,
			rules,
			getActiveDefaultLinkArrowStyle(state),
		),
		opacity: resolveLinkOpacity(
			edge,
			rules,
			getActiveDefaultLinkOpacity(state),
		),
		arrowSize: resolveLinkArrowSize(
			edge,
			rules,
			getActiveDefaultLinkArrowSize(state),
		),
	};
}
