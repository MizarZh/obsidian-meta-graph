import {
	TextFileView,
	type TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { formatError } from '../core/errors';
import type { MetaGraphDocument } from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import type KnowledgeWorkspacePlugin from '../main';
import type { WorkspaceController } from './workspace-controller';

type MountedWorkspace = Parameters<typeof import('svelte').unmount>[0];
type MetaGraphDocumentModule = typeof import('./meta-graph-document');

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'meta-graph';

export class KnowledgeWorkspaceView extends TextFileView {
	private controller?: WorkspaceController;
	private component?: MountedWorkspace;
	private metaGraphDocumentModule?: Promise<MetaGraphDocumentModule>;

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
		const previousData = this.data;
		this.data = data;
		if (!clear && this.component && data === previousData) {
			return;
		}
		if (clear) {
			void this.unmountWorkspace();
		}
		void this.renderMetaGraphData(data);
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
			await this.renderMetaGraphData(this.data);
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

	private async renderMetaGraphData(data: string): Promise<void> {
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		if (this.data !== data) {
			return;
		}
		if (!metaGraphDocument.isMetaGraphMarkdown(data)) {
			void this.plugin.setMarkdownView(this.leaf, false);
			return;
		}
		await this.renderWorkspace(data);
	}

	private async renderWorkspace(data: string): Promise<void> {
		await this.unmountWorkspace();
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		let document: MetaGraphDocument;
		try {
			document = metaGraphDocument.parseMetaGraphDocument(
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
		const [{ mount }, { default: Workspace }, { WorkspaceController }] =
			await Promise.all([
				import('svelte'),
				import('../ui/Workspace.svelte'),
				import('./workspace-controller'),
			]);
		this.controller = new WorkspaceController(
			this.app,
			this.plugin.workspaceIndex,
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

	private async persistDocument(document: MetaGraphDocument): Promise<void> {
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		this.data = metaGraphDocument.stringifyMetaGraphDocument(document);
		this.requestSave();
	}

	private loadMetaGraphDocumentModule(): Promise<MetaGraphDocumentModule> {
		this.metaGraphDocumentModule ??= import('./meta-graph-document');
		return this.metaGraphDocumentModule;
	}

	private async unmountWorkspace(): Promise<void> {
		this.controller?.dispose();
		this.controller = undefined;
		if (this.component) {
			const { unmount } = await import('svelte');
			await unmount(this.component);
			this.component = undefined;
		}
	}
}
