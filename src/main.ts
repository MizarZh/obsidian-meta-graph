import {
	MarkdownView,
	Plugin,
	TFile,
	TFolder,
	WorkspaceLeaf,
	type ViewState,
} from 'obsidian';
import {
	KnowledgeWorkspaceView,
	VIEW_TYPE_KNOWLEDGE_WORKSPACE,
} from './workspace/KnowledgeWorkspaceView';
import {
	DEFAULT_SETTINGS,
	normalizeLargeVaultMode,
	normalizeNodeOpenMode,
	type KnowledgeWorkspaceSettings,
} from './settings/settings';
import { KnowledgeWorkspaceSettingsTab } from './settings/SettingsTab';
import { DEFAULT_GRAPH_QUERY } from './query/graph-query';
import {
	META_GRAPH_FRONTMATTER_KEY,
	META_GRAPH_FRONTMATTER_VALUE,
} from './workspace/meta-graph/constants';
import { WorkspaceIndexService } from './workspace/services/workspace-index-service';
import type { WorkspaceSessionState } from './workspace/meta-graph-v2/types';
import { normalizeWorkspaceSessions } from './workspace/workspace-session';
import type { WorkspaceActionId } from './ui/interactions/keyboard-shortcuts';

export default class KnowledgeWorkspacePlugin extends Plugin {
	settings!: KnowledgeWorkspaceSettings;
	readonly workspaceIndex = new WorkspaceIndexService(this.app);
	private lastActiveFile: TFile | null = null;
	private markdownModeFilesByLeafId = new Map<string, string>();
	private workspaceSessions: Record<string, WorkspaceSessionState> = {};
	private sessionSaveTimer?: number;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.register(() => {
			if (this.sessionSaveTimer !== undefined) {
				window.clearTimeout(this.sessionSaveTimer);
				this.sessionSaveTimer = undefined;
				void this.savePluginData();
			}
		});
		this.lastActiveFile = this.app.workspace.getActiveFile();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					this.lastActiveFile = file;
				}
				this.openMetaGraphFileInCustomView(file);
			}),
		);
		this.app.workspace.onLayoutReady(() => {
			this.workspaceIndex.markReady();
			this.registerEvent(
				this.app.metadataCache.on('changed', (file) => {
					this.workspaceIndex.invalidateFile(file);
				}),
			);
			this.registerEvent(
				this.app.vault.on('create', () => {
					this.workspaceIndex.invalidate();
				}),
			);
			this.registerEvent(
				this.app.vault.on('delete', () => {
					this.workspaceIndex.invalidate();
				}),
			);
			this.registerEvent(
				this.app.vault.on('rename', () => {
					this.workspaceIndex.invalidate();
				}),
			);
		});

		this.registerView(
			VIEW_TYPE_KNOWLEDGE_WORKSPACE,
			(leaf) => new KnowledgeWorkspaceView(leaf, this),
		);
		this.registerMarkdownViewPatch();
		this.addCommand({
			id: 'create-meta-graph',
			name: 'Create graph',
			callback: () => void this.createMetaGraphFile(),
		});
		this.addCommand({
			id: 'open-meta-graph',
			name: 'Open active graph',
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (
					!activeFile ||
					!this.fileHasMetaGraphFrontmatter(activeFile)
				) {
					return false;
				}
				if (!checking) {
					const view =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						void this.setMetaGraphView(view.leaf);
					}
				}
				return true;
			},
		});
		this.addCommand({
			id: 'open-meta-graph-as-markdown',
			name: 'Open graph as Markdown',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(
					KnowledgeWorkspaceView,
				);
				if (!view) {
					return false;
				}
				if (!checking) {
					void this.setMarkdownView(view.leaf);
				}
				return true;
			},
		});
		this.registerWorkspaceActionCommands();
		this.addRibbonIcon('git-fork', 'Create graph', () => {
			void this.createMetaGraphFile();
		});
		this.addSettingTab(new KnowledgeWorkspaceSettingsTab(this.app, this));
	}

	private registerWorkspaceActionCommands(): void {
		const commands: Array<{
			id: string;
			name: string;
			action: WorkspaceActionId;
		}> = [
			{
				id: 'find-meta-graph-note',
				name: 'Find graph note',
				action: 'find-note',
			},
			{
				id: 'open-selected-meta-graph-note',
				name: 'Open selected graph note',
				action: 'open-selected',
			},
			{
				id: 'toggle-meta-graph-pinned-focus',
				name: 'Pin or unpin selected graph neighborhood',
				action: 'toggle-pinned-focus',
			},
			{ id: 'fit-meta-graph', name: 'Fit graph', action: 'fit-graph' },
			{
				id: 'reset-meta-graph-zoom',
				name: 'Reset graph zoom',
				action: 'reset-zoom',
			},
			{
				id: 'zoom-in-meta-graph',
				name: 'Zoom in graph',
				action: 'zoom-in',
			},
			{
				id: 'zoom-out-meta-graph',
				name: 'Zoom out graph',
				action: 'zoom-out',
			},
			{
				id: 'refresh-meta-graph',
				name: 'Refresh graph',
				action: 'refresh-graph',
			},
			{
				id: 'undo-meta-graph-connection',
				name: 'Undo last graph connection',
				action: 'undo',
			},
			{
				id: 'redo-meta-graph-connection',
				name: 'Redo last graph connection',
				action: 'redo',
			},
			{
				id: 'show-meta-graph-shortcuts',
				name: 'Show graph keyboard shortcuts',
				action: 'show-shortcuts',
			},
			{
				id: 'toggle-meta-graph-dock',
				name: 'Toggle graph right panel',
				action: 'toggle-dock',
			},
			{
				id: 'toggle-meta-graph-curated',
				name: 'Toggle graph workspace files',
				action: 'toggle-curated-panel',
			},
			{
				id: 'toggle-meta-graph-connections',
				name: 'Toggle graph connections',
				action: 'toggle-connection-panel',
			},
			{
				id: 'previous-meta-graph-view',
				name: 'Previous graph view',
				action: 'previous-view',
			},
			{
				id: 'next-meta-graph-view',
				name: 'Next graph view',
				action: 'next-view',
			},
		];
		for (const command of commands) {
			this.addCommand({
				id: command.id,
				name: command.name,
				checkCallback: (checking) => {
					const view = this.app.workspace.getActiveViewOfType(
						KnowledgeWorkspaceView,
					);
					if (!view?.canExecuteAction(command.action)) return false;
					if (!checking) view.executeAction(command.action);
					return true;
				},
			});
		}
	}

	async saveSettings(): Promise<void> {
		await this.savePluginData();
		this.workspaceIndex.setLargeVaultMode(this.settings.largeVaultMode);
		this.updateOpenViewsSettings();
	}

	async setDetailsNoteContentExpanded(expanded: boolean): Promise<void> {
		if (this.settings.detailsNoteContentExpanded === expanded) {
			return;
		}
		this.settings.detailsNoteContentExpanded = expanded;
		await this.savePluginData();
	}

	getWorkspaceSession(
		key: string | undefined,
	): WorkspaceSessionState | undefined {
		return key ? this.workspaceSessions[key] : undefined;
	}

	setWorkspaceSession(key: string, session: WorkspaceSessionState): void {
		const fingerprint = JSON.stringify(session);
		if (JSON.stringify(this.workspaceSessions[key]) === fingerprint) {
			return;
		}
		this.workspaceSessions[key] = session;
		this.scheduleSessionSave();
	}

	moveWorkspaceSession(from: string, to: string): void {
		if (from === to || !this.workspaceSessions[from]) return;
		this.workspaceSessions[to] = this.workspaceSessions[from];
		delete this.workspaceSessions[from];
		this.scheduleSessionSave();
	}

	getLastActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile() ?? this.lastActiveFile;
	}

	async setMarkdownView(leaf: WorkspaceLeaf, focus = true): Promise<void> {
		const leafId = getLeafId(leaf);
		if (leafId) {
			const filePath = getViewFilePath(leaf.view.getState());
			if (filePath) {
				this.markdownModeFilesByLeafId.set(leafId, filePath);
			}
		}
		await leaf.setViewState(
			{
				type: 'markdown',
				state: leaf.view.getState(),
				popstate: true,
			} as ViewState,
			{ focus },
		);
	}

	private async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as
			| (Partial<KnowledgeWorkspaceSettings> & {
					workspaceSessions?: unknown;
					workspaceSessionsVersion?: unknown;
			  })
			| null;
		const storedSettings = { ...stored } as Record<string, unknown>;
		delete storedSettings.workspaceSessions;
		delete storedSettings.workspaceSessionsVersion;
		const settings = {
			...DEFAULT_SETTINGS,
			...storedSettings,
		};
		this.workspaceSessions = normalizeWorkspaceSessions(
			stored?.workspaceSessions,
		);
		this.settings = {
			...settings,
			fadeDistance: clamp(settings.fadeDistance, 0.25, 4),
			nodeOpenMode: normalizeNodeOpenMode(settings.nodeOpenMode),
			largeVaultMode: normalizeLargeVaultMode(settings.largeVaultMode),
			detailsNoteContentExpanded:
				settings.detailsNoteContentExpanded === true,
		};
		this.workspaceIndex.setLargeVaultMode(this.settings.largeVaultMode);
	}

	private scheduleSessionSave(): void {
		if (this.sessionSaveTimer !== undefined) {
			window.clearTimeout(this.sessionSaveTimer);
		}
		this.sessionSaveTimer = window.setTimeout(() => {
			this.sessionSaveTimer = undefined;
			void this.savePluginData();
		}, 250);
	}

	private savePluginData(): Promise<void> {
		return this.saveData({
			...this.settings,
			workspaceSessionsVersion: 1,
			workspaceSessions: this.workspaceSessions,
		});
	}

	private updateOpenViewsSettings(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_KNOWLEDGE_WORKSPACE,
		)) {
			if (leaf.view instanceof KnowledgeWorkspaceView) {
				leaf.view.updateDisplaySettings();
			}
		}
	}

	private async createMetaGraphFile(folder?: TFolder): Promise<void> {
		const targetFolder =
			folder ??
			this.app.fileManager.getNewFileParent(
				this.app.workspace.getActiveFile()?.path ?? '',
			);
		const file = await (
			this.app.fileManager as unknown as {
				createNewMarkdownFile(
					parent: TFolder,
					name: string,
				): Promise<TFile>;
			}
		).createNewMarkdownFile(targetFolder, 'Untitled meta graph');
		const { createMetaGraphMarkdown } =
			await import('./workspace/meta-graph-document');
		await this.app.vault.modify(
			file,
			createMetaGraphMarkdown(
				DEFAULT_GRAPH_QUERY.maxNodes,
				this.settings.fadeDistance,
			),
		);
		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({
			type: VIEW_TYPE_KNOWLEDGE_WORKSPACE,
			state: { file: file.path },
			active: true,
		});
	}

	private openMetaGraphFileInCustomView(file: TFile | null): void {
		if (!file || !this.fileHasMetaGraphFrontmatter(file)) {
			return;
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return;
		}
		const leaf = view.leaf;
		const leafId = getLeafId(leaf);
		if (leafId) {
			const markdownModeFile = this.markdownModeFilesByLeafId.get(leafId);
			if (markdownModeFile === file.path) {
				return;
			}
			this.markdownModeFilesByLeafId.delete(leafId);
		}
		void this.setMetaGraphView(leaf);
	}

	private registerMarkdownViewPatch(): void {
		const originalSetViewState = Object.getOwnPropertyDescriptor(
			WorkspaceLeaf.prototype,
			'setViewState',
		)?.value as WorkspaceLeaf['setViewState'];
		const redirectMetaGraphMarkdownView =
			this.redirectMetaGraphMarkdownView.bind(this);
		WorkspaceLeaf.prototype.setViewState = function (
			viewState: ViewState,
			eState?: unknown,
		): Promise<void> {
			return originalSetViewState.call(
				this,
				redirectMetaGraphMarkdownView(this, viewState),
				eState,
			);
		};
		this.register(() => {
			WorkspaceLeaf.prototype.setViewState = originalSetViewState;
		});
	}

	private redirectMetaGraphMarkdownView(
		leaf: WorkspaceLeaf,
		viewState: ViewState,
	): ViewState {
		if (viewState.type !== 'markdown') {
			return viewState;
		}
		const filePath = getViewFilePath(viewState.state);
		if (!filePath || !this.pathHasMetaGraphFrontmatter(filePath)) {
			return viewState;
		}
		const leafId = getLeafId(leaf);
		if (leafId) {
			const markdownModeFile = this.markdownModeFilesByLeafId.get(leafId);
			if (markdownModeFile === filePath) {
				return viewState;
			}
			this.markdownModeFilesByLeafId.delete(leafId);
		}
		return {
			...viewState,
			type: VIEW_TYPE_KNOWLEDGE_WORKSPACE,
		};
	}

	private async setMetaGraphView(leaf: WorkspaceLeaf): Promise<void> {
		const leafId = getLeafId(leaf);
		if (leafId) {
			this.markdownModeFilesByLeafId.delete(leafId);
		}
		await leaf.setViewState({
			type: VIEW_TYPE_KNOWLEDGE_WORKSPACE,
			state: leaf.view.getState(),
			popstate: true,
		} as ViewState);
	}

	private fileHasMetaGraphFrontmatter(file: TFile): boolean {
		return this.pathHasMetaGraphFrontmatter(file.path);
	}

	private pathHasMetaGraphFrontmatter(path: string): boolean {
		const frontmatter = this.app.metadataCache.getCache(path)?.frontmatter;
		return (
			frontmatter?.[META_GRAPH_FRONTMATTER_KEY] ===
			META_GRAPH_FRONTMATTER_VALUE
		);
	}
}

function getLeafId(leaf: WorkspaceLeaf): string | undefined {
	const candidate = (leaf as unknown as { id?: unknown }).id;
	return typeof candidate === 'string' ? candidate : undefined;
}

function getViewFilePath(
	state: Record<string, unknown> | undefined,
): string | undefined {
	return typeof state?.file === 'string' ? state.file : undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Number.isFinite(value)
		? Math.min(maximum, Math.max(minimum, value))
		: minimum;
}
