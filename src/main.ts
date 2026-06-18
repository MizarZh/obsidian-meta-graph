import { Plugin, type TFile } from 'obsidian';
import { KnowledgeWorkspaceView, VIEW_TYPE_KNOWLEDGE_WORKSPACE } from './workspace/KnowledgeWorkspaceView';
import {
	DEFAULT_SETTINGS,
	type KnowledgeWorkspaceSettings,
} from './settings/settings';
import { KnowledgeWorkspaceSettingsTab } from './settings/SettingsTab';

export default class KnowledgeWorkspacePlugin extends Plugin {
	settings!: KnowledgeWorkspaceSettings;
	private lastActiveFile: TFile | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.lastActiveFile = this.app.workspace.getActiveFile();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
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
			id: 'open-knowledge-workspace',
			name: 'Open knowledge workspace',
			callback: () => void this.activateView(),
		});
		this.addRibbonIcon('git-fork', 'Open knowledge workspace', () => {
			void this.activateView();
		});
		this.addSettingTab(new KnowledgeWorkspaceSettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	getLastActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile() ?? this.lastActiveFile;
	}

	private async loadSettings(): Promise<void> {
		this.settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<KnowledgeWorkspaceSettings>),
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
		const leaf = existing ?? this.app.workspace.getLeaf('tab');
		if (!existing) {
			await leaf.setViewState({
				type: VIEW_TYPE_KNOWLEDGE_WORKSPACE,
				active: true,
			});
		}
		await this.app.workspace.revealLeaf(leaf);
	}
}
