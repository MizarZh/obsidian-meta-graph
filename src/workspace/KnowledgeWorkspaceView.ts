import { ItemView, type TFile, type WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import type KnowledgeWorkspacePlugin from '../main';
import Workspace from '../ui/Workspace.svelte';
import { WorkspaceController } from './workspace-controller';

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'knowledge-workspace';

export class KnowledgeWorkspaceView extends ItemView {
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
		return 'Knowledge workspace';
	}

	getIcon(): string {
		return 'git-fork';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		this.controller = new WorkspaceController(
			this.app,
			this.plugin.settings.maxNodes,
			this.plugin.settings.debug,
		);
		this.component = mount(Workspace, {
			target: this.contentEl,
			props: { controller: this.controller },
		});

		this.registerEvent(
			this.app.metadataCache.on('changed', () =>
				this.controller?.scheduleRefresh(),
			),
		);
		this.registerEvent(
			this.app.vault.on('create', () => this.controller?.scheduleRefresh()),
		);
		this.registerEvent(
			this.app.vault.on('delete', () => this.controller?.scheduleRefresh()),
		);
		this.registerEvent(
			this.app.vault.on('rename', () => this.controller?.scheduleRefresh()),
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) =>
				this.controller?.setCurrentFile(file),
			),
		);
		this.controller.initialize(this.plugin.getLastActiveFile());
	}

	async onClose(): Promise<void> {
		this.controller?.dispose();
		this.controller = undefined;
		if (this.component) {
			await unmount(this.component);
			this.component = undefined;
		}
		this.contentEl.empty();
	}
}
