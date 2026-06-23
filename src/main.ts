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
	type KnowledgeWorkspaceSettings,
} from './settings/settings';
import { KnowledgeWorkspaceSettingsTab } from './settings/SettingsTab';
import { DEFAULT_GRAPH_QUERY } from './query/graph-query';
import {
	createMetaGraphMarkdown,
	META_GRAPH_FRONTMATTER_KEY,
	META_GRAPH_FRONTMATTER_VALUE,
} from './workspace/meta-graph-document';

export default class KnowledgeWorkspacePlugin extends Plugin {
	settings!: KnowledgeWorkspaceSettings;
	private lastActiveFile: TFile | null = null;
	private markdownModeFilesByLeafId = new Map<string, string>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.lastActiveFile = this.app.workspace.getActiveFile();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) {
					this.lastActiveFile = file;
				}
				this.openMetaGraphFileInCustomView(file);
			}),
		);

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
				if (!activeFile || !this.fileHasMetaGraphFrontmatter(activeFile)) {
					return false;
				}
				if (!checking) {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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
		this.addRibbonIcon('git-fork', 'Create graph', () => {
			void this.createMetaGraphFile();
		});
		this.addSettingTab(new KnowledgeWorkspaceSettingsTab(this.app, this));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.updateOpenViewsSettings();
	}

	getLastActiveFile(): TFile | null {
		return this.app.workspace.getActiveFile() ?? this.lastActiveFile;
	}

	async setMarkdownView(
		leaf: WorkspaceLeaf,
		focus = true,
	): Promise<void> {
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
		const settings = {
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<KnowledgeWorkspaceSettings>),
		};
		this.settings = {
			...settings,
			fadeDistance: clamp(settings.fadeDistance, 0.25, 4),
		};
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
		).createNewMarkdownFile(
			targetFolder,
			'Untitled meta graph',
		);
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
		const frontmatter =
			this.app.metadataCache.getCache(path)?.frontmatter;
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
