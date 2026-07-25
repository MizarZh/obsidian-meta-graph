import {
	TFile,
	TextFileView,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { formatError } from '../core/errors';
import type { MetaGraphDocument, WorkspaceState } from '../core/types';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import type KnowledgeWorkspacePlugin from '../main';
import type { WorkspaceController } from './workspace-controller';
import type {
	PersistedMetaGraphDocumentV2,
	WorkspacePersistenceContext,
	WorkspaceSessionState,
} from './meta-graph-v2/types';
import { applyWorkspaceSession } from './workspace-session';
import { serializeWorkspaceStateV2 } from './meta-graph-v2/codec';

type MountedWorkspace = Parameters<typeof import('svelte').unmount>[0];
type MetaGraphDocumentModule = typeof import('./meta-graph-document');

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'meta-graph';

export class KnowledgeWorkspaceView extends TextFileView {
	private controller?: WorkspaceController;
	private component?: MountedWorkspace;
	private metaGraphDocumentModule?: Promise<MetaGraphDocumentModule>;
	private rightSplitLeaf?: WorkspaceLeaf;
	private persistence?: WorkspacePersistenceContext;
	private sessionKey?: string;

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
			this.app.vault.on('rename', (file, oldPath) => {
				const previousSessionKey = `path:${oldPath}`;
				if (this.sessionKey === previousSessionKey) {
					this.sessionKey = `path:${file.path}`;
					this.plugin.moveWorkspaceSession(
						previousSessionKey,
						this.sessionKey,
					);
				}
				this.controller?.updateFileReferences(oldPath, file.path);
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
		this.rightSplitLeaf = undefined;
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
		let session: WorkspaceSessionState | undefined;
		try {
			const parsed = metaGraphDocument.parseMetaGraphWorkspace(
				data,
				DEFAULT_GRAPH_QUERY.maxNodes,
				this.plugin.settings.fadeDistance,
			);
			this.persistence = parsed.persistence;
			this.sessionKey = this.file?.path
				? `path:${this.file.path}`
				: undefined;
			session = this.plugin.getWorkspaceSession(this.sessionKey);
			document = applyWorkspaceSession(
				parsed.document,
				parsed.persistence,
				session,
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
			this.persistence.readOnly,
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
				initialDetailsNoteContentExpanded:
					this.plugin.settings.detailsNoteContentExpanded,
				onDetailsNoteContentExpandedChange: (expanded: boolean) =>
					void this.plugin.setDetailsNoteContentExpanded(expanded),
				onOpenNodeInRightSplit: (nodeId: string) =>
					this.openNodeInRightSplit(nodeId),
				getNodeOpenMode: () => this.plugin.settings.nodeOpenMode,
				readOnly: this.persistence.readOnly,
				sourceVersion: this.persistence.sourceVersion,
				serializeDocument: (state: WorkspaceState) =>
					serializeWorkspaceStateV2(state, this.requirePersistence()),
				initialSession: session,
				onSessionStateChange: (nextSession: WorkspaceSessionState) =>
					this.persistSession(nextSession),
				onAutoSave: (nextDocument: PersistedMetaGraphDocumentV2) =>
					this.persistDocument(nextDocument),
			},
		});
		this.controller.initialize(this.plugin.getLastActiveFile());
	}

	private async openNodeInRightSplit(nodeId: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(nodeId);
		if (!(file instanceof TFile)) {
			return;
		}
		if (!this.rightSplitLeaf || !this.isLeafAttached(this.rightSplitLeaf)) {
			this.rightSplitLeaf = this.app.workspace.getLeaf(
				'split',
				'vertical',
			);
		}
		await this.rightSplitLeaf.openFile(file, { active: true });
	}

	private isLeafAttached(target: WorkspaceLeaf): boolean {
		let attached = false;
		this.app.workspace.iterateAllLeaves((leaf) => {
			attached ||= leaf === target;
		});
		return attached;
	}

	private async persistDocument(
		document: PersistedMetaGraphDocumentV2,
	): Promise<void> {
		const persistence = this.requirePersistence();
		if (persistence.readOnly) {
			return;
		}
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		this.data = metaGraphDocument.stringifyMetaGraphDocument(document);
		this.requestSave();
	}

	private persistSession(session: WorkspaceSessionState): void {
		if (!this.sessionKey) return;
		this.plugin.setWorkspaceSession(this.sessionKey, session);
	}

	private requirePersistence(): WorkspacePersistenceContext {
		if (!this.persistence) {
			throw new Error(
				'Workspace persistence context is not initialized.',
			);
		}
		return this.persistence;
	}

	private loadMetaGraphDocumentModule(): Promise<MetaGraphDocumentModule> {
		this.metaGraphDocumentModule ??= import('./meta-graph-document');
		return this.metaGraphDocumentModule;
	}

	private async unmountWorkspace(): Promise<void> {
		this.controller?.dispose();
		this.controller = undefined;
		this.persistence = undefined;
		this.sessionKey = undefined;
		if (this.component) {
			const { unmount } = await import('svelte');
			await unmount(this.component);
			this.component = undefined;
		}
	}
}
