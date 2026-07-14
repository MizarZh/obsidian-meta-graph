import type { KnowledgeEdge, WorkspaceState } from '../../core/types';
import {
	getActiveDefaultLinkStyle,
	getActiveLinkStyleRules,
} from '../../graph/styles/active-styles';
import { resolveLinkStyle, type LinkStyle } from '../../graph/styles/style-rules';

export function resolveConnectionPreviewStyle(
	state: WorkspaceState,
	sourceNodeId: string,
	targetNodeId = sourceNodeId,
): LinkStyle {
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

	return resolveLinkStyle(edge, getActiveLinkStyleRules(state), {
		color: defaults.color,
		size: defaults.size,
		lineStyle: defaults.lineStyle,
		label: defaults.showLabel ? defaults.label || field : '',
		hidden: defaults.hidden,
	});
}
