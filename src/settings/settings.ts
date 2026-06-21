export interface KnowledgeWorkspaceSettings {
	maxNodes: number;
	fadeDistance: number;
	debug: boolean;
	showDebugButton: boolean;
	relayoutFlowAfterConnection: boolean;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	maxNodes: 200,
	fadeDistance: 1.5,
	debug: false,
	showDebugButton: false,
	relayoutFlowAfterConnection: false,
};
