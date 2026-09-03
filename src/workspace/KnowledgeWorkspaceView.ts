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
import type { WorkspaceActionId } from '../ui/interactions/keyboard-shortcuts';

type MountedWorkspace = Parameters<typeof import('svelte').unmount>[0];
type MetaGraphDocumentModule = typeof import('./meta-graph-document');

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'meta-graph';

export class KnowledgeWorkspaceView extends TextFileView {
	private controller?: WorkspaceController;
	private component?: MountedWorkspace;
	private metaGraphDocumentModule?: Promise<MetaGraphDocumentModule>;
	private rightSplitLeaf?: WorkspaceLeaf;
	private sessionKey?: string;
	private renderRevision = 0;
	private unmountPromise?: Promise<void>;
	private workspaceActions?: {
		canExecute(action: WorkspaceActionId): boolean;
		execute(action: WorkspaceActionId): boolean;
	};

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
		const revision = ++this.renderRevision;
		void this.renderMetaGraphData(data, revision);
	}

	clear(): void {
		this.renderRevision += 1;
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
			const revision = ++this.renderRevision;
			await this.renderMetaGraphData(this.data, revision);
		}
	}

	async onClose(): Promise<void> {
		this.renderRevision += 1;
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

	canExecuteAction(action: WorkspaceActionId): boolean {
		return this.workspaceActions?.canExecute(action) ?? false;
	}

	executeAction(action: WorkspaceActionId): boolean {
		return this.workspaceActions?.execute(action) ?? false;
	}

	private async renderMetaGraphData(
		data: string,
		revision: number,
	): Promise<void> {
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		if (this.data !== data || this.renderRevision !== revision) {
			return;
		}
		if (!metaGraphDocument.isMetaGraphMarkdown(data)) {
			void this.plugin.setMarkdownView(this.leaf, false);
			return;
		}
		await this.renderWorkspace(data, revision);
	}

	private async renderWorkspace(data: string, revision: number): Promise<void> {
		await this.unmountWorkspace();
		if (this.data !== data || this.renderRevision !== revision) {
			return;
		}
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		const metaGraphDocument = await this.loadMetaGraphDocumentModule();
		let document: MetaGraphDocument;
		let persistence: WorkspacePersistenceContext;
		let sessionKey: string | undefined;
		let session: WorkspaceSessionState | undefined;
		try {
			const parsed = metaGraphDocument.parseMetaGraphWorkspace(
				data,
				DEFAULT_GRAPH_QUERY.maxNodes,
				this.plugin.settings.fadeDistance,
			);
			persistence = parsed.persistence;
			sessionKey = this.file?.path
				? `path:${this.file.path}`
				: undefined;
			session = this.plugin.getWorkspaceSession(sessionKey);
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
		if (this.data !== data || this.renderRevision !== revision) {
			return;
		}
		this.sessionKey = sessionKey;
		this.controller = new WorkspaceController(
			this.app,
			this.plugin.workspaceIndex,
			DEFAULT_GRAPH_QUERY.maxNodes,
			this.plugin.settings.debug,
			this.plugin.settings.relayoutFlowAfterConnection,
			this.plugin.settings.fadeDistance,
			document,
			persistence.readOnly,
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
				readOnly: persistence.readOnly,
				sourceVersion: persistence.sourceVersion,
				serializeDocument: (state: WorkspaceState) =>
					serializeWorkspaceStateV2(state, persistence),
				initialSession: session,
				onSessionStateChange: (nextSession: WorkspaceSessionState) =>
					this.persistSession(nextSession),
				onAutoSave: (nextDocument: PersistedMetaGraphDocumentV2) =>
					this.persistDocument(nextDocument, persistence),
				onWorkspaceActionsChange: (
					host:
						| {
								canExecute(action: WorkspaceActionId): boolean;
								execute(action: WorkspaceActionId): boolean;
						  }
						| undefined,
				) => {
					this.workspaceActions = host;
				},
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
		persistence: WorkspacePersistenceContext,
	): Promise<void> {
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

	private loadMetaGraphDocumentModule(): Promise<MetaGraphDocumentModule> {
		this.metaGraphDocumentModule ??= import('./meta-graph-document');
		return this.metaGraphDocumentModule;
	}

	private async unmountWorkspace(): Promise<void> {
		if (this.unmountPromise) {
			await this.unmountPromise;
			return;
		}
		const unmountPromise = this.performUnmountWorkspace();
		this.unmountPromise = unmountPromise;
		try {
			await unmountPromise;
		} finally {
			if (this.unmountPromise === unmountPromise) {
				this.unmountPromise = undefined;
			}
		}
	}

	private async performUnmountWorkspace(): Promise<void> {
		this.workspaceActions = undefined;
		const component = this.component;
		const controller = this.controller;
		const sessionKey = this.sessionKey;
		this.component = undefined;
		try {
			if (component) {
				const { unmount } = await import('svelte');
				await unmount(component);
			}
		} finally {
			if (this.controller === controller) {
				controller?.dispose();
				this.controller = undefined;
			}
			if (this.sessionKey === sessionKey) {
				this.sessionKey = undefined;
			}
		}
	}
}
