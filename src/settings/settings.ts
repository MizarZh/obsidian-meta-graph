export interface KnowledgeWorkspaceSettings {
	fadeDistance: number;
	debug: boolean;
	showDebugButton: boolean;
	relayoutFlowAfterConnection: boolean;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	fadeDistance: 1.5,
	debug: false,
	showDebugButton: false,
	relayoutFlowAfterConnection: false,
};
