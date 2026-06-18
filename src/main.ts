import { Plugin, type TFile } from "obsidian";
import type { SavedWorkspace, SavedWorkspaceState } from "./core/types";
import {
	KnowledgeWorkspaceView,
	VIEW_TYPE_KNOWLEDGE_WORKSPACE,
} from "./workspace/KnowledgeWorkspaceView";
import {
	DEFAULT_SETTINGS,
	type KnowledgeWorkspaceSettings,
} from "./settings/settings";
import { KnowledgeWorkspaceSettingsTab } from "./settings/SettingsTab";
import { cloneSerializable } from "./workspace/workspace-persistence";

export default class KnowledgeWorkspacePlugin extends Plugin {
	settings!: KnowledgeWorkspaceSettings;
	private lastActiveFile: TFile | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.lastActiveFile = this.app.workspace.getActiveFile();
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file) {
					this.lastActiveFile = file;
				}
			}),
		);

		this.registerView(
			VIEW_TYPE_KNOWLEDGE_WORKSPACE,
			(leaf) => new KnowledgeWorkspaceView(leaf, this),
		);
		this.addCommand({
			id: "open-knowledge-workspace",
			name: "Open knowledge workspace",
			callback: () => void this.activateView(),
		});
		this.addRibbonIcon("git-fork", "Open knowledge workspace", () => {
			void this.activateView();
		});
		this.addSettingTab(new KnowledgeWorkspaceSettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_KNOWLEDGE_WORKSPACE,
		)) {
			if (leaf.view instanceof KnowledgeWorkspaceView) {
				leaf.view.updateDisplaySettings();
			}
		}
	}

	async saveNamedWorkspace(
		name: string,
		state: SavedWorkspaceState,
		id?: string,
	): Promise<SavedWorkspace> {
		const workspace: SavedWorkspace = {
			id: id ?? createWorkspaceId(),
			name,
			state: cloneSerializable(state),
			updatedAt: new Date().toISOString(),
		};
		const existingIndex = this.settings.savedWorkspaces.findIndex(
			(item) => item.id === workspace.id,
		);
		if (existingIndex >= 0) {
			this.settings.savedWorkspaces[existingIndex] = workspace;
		} else {
			this.settings.savedWorkspaces.push(workspace);
		}
		this.settings.activeWorkspaceId = workspace.id;
		await this.saveData(this.settings);
		return cloneSerializable(workspace);
	}

	async deleteNamedWorkspace(id: string): Promise<void> {
		this.settings.savedWorkspaces = this.settings.savedWorkspaces.filter(
			(workspace) => workspace.id !== id,
		);
		if (this.settings.activeWorkspaceId === id) {
			this.settings.activeWorkspaceId = undefined;
		}
		await this.saveData(this.settings);
	}

	getLastActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile() ?? this.lastActiveFile;
	}

	private async loadSettings(): Promise<void> {
		const settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<KnowledgeWorkspaceSettings>),
		};
		this.settings = {
			...settings,
			fadeDistance: clamp(settings.fadeDistance, 0.25, 4),
			savedWorkspaces: settings.savedWorkspaces ?? [],
		};
	}

	private async activateView(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			this.lastActiveFile = activeFile;
		}
		const existing = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_KNOWLEDGE_WORKSPACE,
		)[0];
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) {
			await leaf.setViewState({
				type: VIEW_TYPE_KNOWLEDGE_WORKSPACE,
				active: true,
			});
		}
		await this.app.workspace.revealLeaf(leaf);
	}
}

function createWorkspaceId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Number.isFinite(value)
		? Math.min(maximum, Math.max(minimum, value))
		: minimum;
}
