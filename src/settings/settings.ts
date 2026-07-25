import type { NodeOpenMode } from '../core/types';

export type LargeVaultMode = 'auto' | 'on' | 'off';

export interface KnowledgeWorkspaceSettings {
	fadeDistance: number;
	debug: boolean;
	showDebugButton: boolean;
	relayoutFlowAfterConnection: boolean;
	openTemplateNoteInNewTab: boolean;
	nodeOpenMode: NodeOpenMode;
	detailsNoteContentExpanded: boolean;
	largeVaultMode: LargeVaultMode;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	fadeDistance: 1.5,
	debug: false,
	showDebugButton: false,
	relayoutFlowAfterConnection: false,
	openTemplateNoteInNewTab: false,
	nodeOpenMode: 'tab',
	detailsNoteContentExpanded: false,
	largeVaultMode: 'auto',
};

export function normalizeNodeOpenMode(value: unknown): NodeOpenMode {
	return value === 'tab' || value === 'right-split'
		? value
		: DEFAULT_SETTINGS.nodeOpenMode;
}

export function normalizeLargeVaultMode(value: unknown): LargeVaultMode {
	return value === 'on' || value === 'off' || value === 'auto'
		? value
		: DEFAULT_SETTINGS.largeVaultMode;
}
