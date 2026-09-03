import type {
	DockConnectionDirection,
	DockTemplateNode,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import { createWorkspaceTemplateNote } from '../actions/template-actions';
import { resolveTemplateNoteRequest } from '../actions/template-request';
import { placeNodeInDefaultGroupInState } from '../state/manual-layout-state';
import type { WorkspaceStore } from './workspace-store';

type TemplateNoteFile = { path: NodeId };

export interface WorkspaceTemplateCoordinatorOptions {
	store: WorkspaceStore;
	readOnly: boolean;
	createNoteFile(
		template: DockTemplateNode,
		title: string,
	): Promise<TemplateNoteFile>;
	connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection,
		field: string,
	): Promise<void>;
	commit(state: WorkspaceState): boolean;
}

export class WorkspaceTemplateCoordinator {
	constructor(
		private readonly options: WorkspaceTemplateCoordinatorOptions,
	) {}

	async createNote(
		templateId: string,
		targetNodeId: NodeId,
		name: string,
		direction: DockConnectionDirection,
		field: string,
	): Promise<string> {
		this.assertWritable();
		return createWorkspaceTemplateNote({
			templates: this.options.store.snapshot.dock.templates,
			templateId,
			targetNodeId,
			name,
			direction,
			field,
			createNoteFile: (template, title) =>
				this.options.createNoteFile(template, title),
			connectDockNote: (
				notePath,
				target,
				dockDirection,
				connectionField,
			) =>
				this.options.connectDockNote(
					notePath,
					target,
					dockDirection,
					connectionField,
				),
			placeTemplateNoteInDefaultGroup: (path, groupId) => {
				this.options.commit(
					placeNodeInDefaultGroupInState(
						this.options.store.snapshot,
						path,
						groupId,
					),
				);
			},
		});
	}

	async createStandaloneNote(
		templateId: string,
		name: string,
	): Promise<string> {
		this.assertWritable();
		const { template, title } = resolveTemplateNoteRequest(
			this.options.store.snapshot.dock.templates,
			templateId,
			name,
		);
		const file = await this.options.createNoteFile(template, title);
		return file.path;
	}

	private assertWritable(): void {
		if (this.options.readOnly) {
			throw new Error(
				'This Meta Graph uses a newer format and is read-only.',
			);
		}
	}
}
