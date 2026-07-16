import type { NodeOpenMode } from '../core/types';

export interface KnowledgeWorkspaceSettings {
	fadeDistance: number;
	debug: boolean;
	showDebugButton: boolean;
	relayoutFlowAfterConnection: boolean;
	openTemplateNoteInNewTab: boolean;
	nodeOpenMode: NodeOpenMode;
	detailsNoteContentExpanded: boolean;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	fadeDistance: 1.5,
	debug: false,
	showDebugButton: false,
	relayoutFlowAfterConnection: false,
	openTemplateNoteInNewTab: false,
	nodeOpenMode: 'tab',
	detailsNoteContentExpanded: false,
};

export function normalizeNodeOpenMode(value: unknown): NodeOpenMode {
	return value === 'tab' || value === 'right-split'
		? value
		: DEFAULT_SETTINGS.nodeOpenMode;
}
