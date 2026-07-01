import { TFile, type App } from 'obsidian';
import type {
	DebugSnapshot,
	DockConnectionDirection,
	WorkspaceState,
} from '../../core/types';
import type { WorkspaceController } from '../../workspace/workspace-controller';
import { CreateFromTemplateModal } from '../CreateFromTemplateModal';
import { findDockTemplateLabel } from './derived';
import { openCreatedTemplateNote } from './template-actions';
import { openWorkspaceTemplateNote } from './template-modal-actions';

export interface WorkspaceCreateTemplateFlowOptions {
	app: App;
	controller: WorkspaceController;
	workspaceState: WorkspaceState;
	debugSnapshot: DebugSnapshot;
	openTemplateNoteInNewTab: boolean;
	templateId: string;
	targetNodeId: string;
	label?: string;
	direction?: DockConnectionDirection;
}

export interface WorkspaceCreateStandaloneTemplateFlowOptions {
	app: App;
	controller: WorkspaceController;
	workspaceState: WorkspaceState;
	openTemplateNoteInNewTab: boolean;
	templateId: string;
	label?: string;
	position: { x: number; y: number };
	groupId?: string;
}

export function openWorkspaceCreateTemplateNote({
	app,
	controller,
	workspaceState,
	debugSnapshot,
	openTemplateNoteInNewTab,
	templateId,
	targetNodeId,
	label,
	direction = 'from-dock-to-graph',
}: WorkspaceCreateTemplateFlowOptions): Promise<void> {
	return openWorkspaceTemplateNote({
		app,
		templateId,
		targetNodeId,
		label,
		direction,
		templates: workspaceState.dock.templates,
		debugSnapshot,
		activeConnectionField: workspaceState.activeConnectionField,
		openInNewTab: openTemplateNoteInNewTab,
		createNoteFromTemplate: (id, target, name, linkDirection, field) =>
			controller.createNoteFromTemplate(
				id,
				target,
				name,
				linkDirection,
				field,
			),
		addCuratedFile: (path) => {
			controller.addCuratedFile(path);
			controller.refresh();
		},
		opener: {
			getFile: (path) => app.vault.getAbstractFileByPath(path),
			isOpenableFile: (file): file is TFile => file instanceof TFile,
			openFile: (file) => app.workspace.getLeaf('tab').openFile(file),
		},
	});
}

export async function openWorkspaceCreateStandaloneTemplateNote({
	app,
	controller,
	workspaceState,
	openTemplateNoteInNewTab,
	templateId,
	label,
	position,
	groupId,
}: WorkspaceCreateStandaloneTemplateFlowOptions): Promise<void> {
	const templateLabel =
		label ??
		findDockTemplateLabel(workspaceState.dock.templates, templateId);
	if (!templateLabel) {
		return;
	}
	const filePath = await new Promise<string | undefined>((resolve) => {
		new CreateFromTemplateModal(
			app,
			templateLabel,
			undefined,
			async (name) => {
				const path = await controller.createStandaloneNoteFromTemplate(
					templateId,
					name,
				);
				resolve(path);
			},
		).open();
	});
	if (!filePath) {
		return;
	}
	controller.addCuratedFile(filePath, groupId);
	controller.setManualNodePosition(filePath, position, groupId);
	controller.refresh();
	await openCreatedTemplateNote(filePath, openTemplateNoteInNewTab, {
		getFile: (path) => app.vault.getAbstractFileByPath(path),
		isOpenableFile: (file): file is TFile => file instanceof TFile,
		openFile: (file) => app.workspace.getLeaf('tab').openFile(file),
	});
}
