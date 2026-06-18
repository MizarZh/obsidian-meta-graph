import {
	ItemView,
	type TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from 'obsidian';
import { mount, unmount } from 'svelte';
import type {
	SavedWorkspace,
	SavedWorkspaceState,
} from '../core/types';
import type KnowledgeWorkspacePlugin from '../main';
import Workspace from '../ui/Workspace.svelte';
import { WorkspaceNameModal } from '../ui/WorkspaceNameModal';
import { WorkspaceController } from './workspace-controller';
import {
	cloneSerializable,
	serializeWorkspaceState,
} from './workspace-persistence';

export const VIEW_TYPE_KNOWLEDGE_WORKSPACE = 'knowledge-workspace';

export class KnowledgeWorkspaceView extends ItemView {
	private controller?: WorkspaceController;
	private component?: ReturnType<typeof mount>;
	private restoredState?: SavedWorkspaceState;
	private activeWorkspaceId?: string;

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

	getState(): Record<string, unknown> {
		return {
			workspace:
				this.controller
					? serializeWorkspaceState(this.controller.snapshot)
					: this.restoredState,
			activeWorkspaceId: this.activeWorkspaceId,
		};
	}

	async setState(
		state: unknown,
		_result: ViewStateResult,
	): Promise<void> {
		const persisted = parsePersistedViewState(state);
		this.restoredState = persisted.workspace;
		this.activeWorkspaceId = persisted.activeWorkspaceId;
		if (persisted.workspace) {
			this.controller?.restoreWorkspace(persisted.workspace);
		}
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('knowledge-workspace-view');
		this.controller = new WorkspaceController(
			this.app,
			this.plugin.settings.maxNodes,
			this.plugin.settings.debug,
			this.plugin.settings.fadeDistance,
			this.restoredState ?? this.plugin.settings.lastWorkspace,
		);
		this.component = mount(Workspace, {
			target: this.contentEl,
			props: {
				controller: this.controller,
				onFadeDistanceCommit: (fadeDistance: number) => {
					this.plugin.settings.fadeDistance = fadeDistance;
					void this.plugin.saveSettings();
				},
				initialSavedWorkspaces: cloneSerializable(
					this.plugin.settings.savedWorkspaces,
				),
				initialActiveWorkspaceId:
					this.activeWorkspaceId ??
					this.plugin.settings.activeWorkspaceId,
				onAutoSave: (
					state: SavedWorkspaceState,
					activeWorkspaceId?: string,
				) => this.persistViewState(state, activeWorkspaceId),
				onSaveWorkspace: (
					name: string,
					state: SavedWorkspaceState,
					id?: string,
				) => this.plugin.saveNamedWorkspace(name, state, id),
				onDeleteWorkspace: (id: string) =>
					this.plugin.deleteNamedWorkspace(id),
				onSaveWorkspaceAs: (
					initialName: string,
					state: SavedWorkspaceState,
				) => this.saveWorkspaceAs(initialName, state),
			},
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

	private saveWorkspaceAs(
		initialName: string,
		state: SavedWorkspaceState,
	): Promise<SavedWorkspace | undefined> {
		return new Promise((resolve) => {
			let saved = false;
			const modal = new WorkspaceNameModal(
				this.app,
				initialName,
				(name) => this.plugin.saveNamedWorkspace(name, state),
				(workspace) => {
					saved = true;
					resolve(workspace);
				},
			);
			const originalClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				originalClose();
				if (!saved) {
					resolve(undefined);
				}
			};
			modal.open();
		});
	}

	private persistViewState(
		state: SavedWorkspaceState,
		activeWorkspaceId?: string,
	): Promise<void> {
		this.restoredState = cloneSerializable(state);
		this.activeWorkspaceId = activeWorkspaceId;
		this.app.workspace.requestSaveLayout();
		return Promise.resolve();
	}

	updateDisplaySettings(): void {
		this.controller?.setFadeDistance(this.plugin.settings.fadeDistance);
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

function parsePersistedViewState(state: unknown): {
	workspace?: SavedWorkspaceState;
	activeWorkspaceId?: string;
} {
	if (!state || typeof state !== 'object') {
		return {};
	}
	const record = state as Record<string, unknown>;
	return {
		workspace:
			record.workspace && typeof record.workspace === 'object'
				? (record.workspace as SavedWorkspaceState)
				: undefined,
		activeWorkspaceId:
			typeof record.activeWorkspaceId === 'string'
				? record.activeWorkspaceId
				: undefined,
	};
}
