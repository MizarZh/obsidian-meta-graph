import {
	TextFileView,
	type TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { mount, unmount } from 'svelte';
import { formatError } from '../core/errors';
import type { MetaGraphDocument } from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import type KnowledgeWorkspacePlugin from '../main';
import Workspace from '../ui/Workspace.svelte';
import {
	isMetaGraphMarkdown,
	parseMetaGraphDocument,
	stringifyMetaGraphDocument,
} from './meta-graph-document';
import { WorkspaceController } from './workspace-controller';

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'meta-graph';

export class KnowledgeWorkspaceView extends TextFileView {
	private controller?: WorkspaceController;
	private component?: ReturnType<typeof mount>;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: KnowledgeWorkspacePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_KNOWLEDGE_WORKSPACE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Meta graph';
	}

	getIcon(): string {
		return 'git-fork';
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		if (clear) {
			void this.unmountWorkspace();
		}
		if (!isMetaGraphMarkdown(data)) {
			void this.plugin.setMarkdownView(this.leaf, false);
			return;
		}
		void this.renderWorkspace(data);
	}

	clear(): void {
		void this.unmountWorkspace();
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		this.registerEvent(
			this.app.metadataCache.on('changed', () =>
				this.controller?.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.vault.on('create', () =>
				this.controller?.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.vault.on('delete', () =>
				this.controller?.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.controller?.updateDockNotePath(oldPath, file.path);
				this.controller?.updateCuratedFilePath(oldPath, file.path);
				this.controller?.scheduleRefresh();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) =>
				this.controller?.setCurrentFile(file),
			),
		);
		if (this.data) {
			await this.renderWorkspace(this.data);
		}
	}

	async onClose(): Promise<void> {
		await this.unmountWorkspace();
		this.contentEl.empty();
	}

	updateDisplaySettings(): void {
		this.controller?.setFadeDistance(this.plugin.settings.fadeDistance);
		this.controller?.setRelayoutFlowAfterConnection(
			this.plugin.settings.relayoutFlowAfterConnection,
		);
	}

	private async renderWorkspace(data: string): Promise<void> {
		await this.unmountWorkspace();
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		let document: MetaGraphDocument;
		try {
			document = parseMetaGraphDocument(
				data,
				DEFAULT_GRAPH_QUERY.maxNodes,
				this.plugin.settings.fadeDistance,
			);
		} catch (error) {
			this.contentEl.createEl('pre', {
				cls: 'knowledge-workspace-error',
				text: formatError(error),
			});
			return;
		}
		this.controller = new WorkspaceController(
			this.app,
			DEFAULT_GRAPH_QUERY.maxNodes,
			this.plugin.settings.debug,
			this.plugin.settings.relayoutFlowAfterConnection,
			this.plugin.settings.fadeDistance,
			document,
		);
		this.component = mount(Workspace, {
			target: this.contentEl,
			props: {
				app: this.app,
				controller: this.controller,
				workspaceFilePath: this.file?.path,
				showDebugButton: this.plugin.settings.showDebugButton,
				openTemplateNoteInNewTab:
					this.plugin.settings.openTemplateNoteInNewTab,
				onAutoSave: (nextDocument: MetaGraphDocument) =>
					this.persistDocument(nextDocument),
			},
		});
		this.controller.initialize(this.plugin.getLastActiveFile());
	}

	private persistDocument(document: MetaGraphDocument): Promise<void> {
		this.data = stringifyMetaGraphDocument(document);
		this.requestSave();
		return Promise.resolve();
	}

	private async unmountWorkspace(): Promise<void> {
		this.controller?.dispose();
		this.controller = undefined;
		if (this.component) {
			await unmount(this.component);
			this.component = undefined;
		}
	}
}
