import type {
	ConnectionFieldMode,
	KnowledgeEdge,
	WorkspaceState,
} from '@/core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultLinkArrowSize,
	getActiveLinkStyleRules,
	getActiveDefaultLinkArrowStyle,
	getActiveDefaultLinkOpacity,
} from '@/graph/styles/active-styles';
import {
	resolveLinkVisualStyle,
	type LinkVisualStyle,
} from '@/graph/styles/style-rules';

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
): LinkVisualStyle {
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
	return resolveLinkVisualStyle(edge, rules, {
		color: defaults.color,
		size: defaults.size,
		lineStyle: defaults.lineStyle,
		label: defaults.showLabel ? defaults.label || field : '',
		hidden: defaults.hidden,
		arrowStyle: getActiveDefaultLinkArrowStyle(state),
		opacity: getActiveDefaultLinkOpacity(state),
		arrowSize: getActiveDefaultLinkArrowSize(state),
	});
}
