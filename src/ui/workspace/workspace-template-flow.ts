import { TFile, type App } from 'obsidian';
import type {
	DebugSnapshot,
	DockConnectionDirection,
	WorkspaceState,
} from '../../core/types';
import type { WorkspaceController } from '../../workspace/workspace-controller';
import { CreateFromTemplateModal } from '../CreateFromTemplateModal';
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
	openNote: (path: string) => Promise<void>;
}

export interface WorkspaceCreateStandaloneTemplateFlowOptions {
	app: App;
	controller: WorkspaceController;
	workspaceState: WorkspaceState;
	openTemplateNoteInNewTab: boolean;
	templateId: string;
	label?: string;
	position?: { x: number; y: number };
	groupId?: string;
	addToCurated?: boolean;
	openNote: (path: string) => Promise<void>;
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
	openNote,
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
			controller.selectNode(path);
			void controller.refresh();
		},
		opener: {
			getFile: (path) => app.vault.getAbstractFileByPath(path),
			isOpenableFile: (file): file is TFile => file instanceof TFile,
			openFile: (file) => openNote(file.path),
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
	addToCurated = true,
	openNote,
}: WorkspaceCreateStandaloneTemplateFlowOptions): Promise<void> {
	const template = workspaceState.dock.templates.find(
		(candidate) => candidate.id === templateId,
	);
	const templateLabel = label ?? template?.label;
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
	if (addToCurated) {
		const targetGroupId = groupId ?? template?.defaultGroupId;
		controller.addCuratedFile(filePath, targetGroupId);
		controller.selectNode(filePath);
		if (position) {
			controller.setManualNodePosition(filePath, position, targetGroupId);
		}
		void controller.refresh();
	}
	await openCreatedTemplateNote(filePath, openTemplateNoteInNewTab, {
		getFile: (path) => app.vault.getAbstractFileByPath(path),
		isOpenableFile: (file): file is TFile => file instanceof TFile,
		openFile: (file) => openNote(file.path),
	});
}
