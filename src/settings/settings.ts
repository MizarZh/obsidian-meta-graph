export interface KnowledgeWorkspaceSettings {
	maxNodes: number;
	debug: boolean;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	maxNodes: 200,
	debug: false,
};
