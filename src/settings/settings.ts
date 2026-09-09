import type { NodeOpenMode } from '@/core/types';

export type LargeVaultMode = 'auto' | 'on' | 'off';
export type NodeHoverMode = 'emphasis' | 'local';

export interface KnowledgeWorkspaceSettings {
	fadeDistance: number;
	debug: boolean;
	performanceLogging: boolean;
	showDebugButton: boolean;
	relayoutFlowAfterConnection: boolean;
	openTemplateNoteInNewTab: boolean;
	nodeOpenMode: NodeOpenMode;
	detailsNoteContentExpanded: boolean;
	largeVaultMode: LargeVaultMode;
	nodeHoverMode: NodeHoverMode;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	fadeDistance: 1.5,
	debug: false,
	performanceLogging: false,
	showDebugButton: false,
	relayoutFlowAfterConnection: false,
	openTemplateNoteInNewTab: false,
	nodeOpenMode: 'tab',
	detailsNoteContentExpanded: false,
	largeVaultMode: 'auto',
	nodeHoverMode: 'local',
};

export function normalizeNodeHoverMode(value: unknown): NodeHoverMode {
	return value === 'emphasis' ? 'emphasis' : 'local';
}

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
