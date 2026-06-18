import type {
	SavedWorkspace,
	SavedWorkspaceState,
} from '../core/types';

export interface KnowledgeWorkspaceSettings {
	maxNodes: number;
	fadeDistance: number;
	debug: boolean;
	savedWorkspaces: SavedWorkspace[];
	lastWorkspace?: SavedWorkspaceState;
	activeWorkspaceId?: string;
}

export const DEFAULT_SETTINGS: KnowledgeWorkspaceSettings = {
	maxNodes: 200,
	fadeDistance: 1.5,
	debug: false,
	savedWorkspaces: [],
};
