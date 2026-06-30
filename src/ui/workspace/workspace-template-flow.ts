import { TFile, type App } from 'obsidian';
import type {
	DebugSnapshot,
	DockConnectionDirection,
	WorkspaceState,
} from '../../core/types';
import type { WorkspaceController } from '../../workspace/workspace-controller';
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
			controller.createNoteFromTemplate(id, target, name, linkDirection, field),
		addCuratedFile: (path) => controller.addCuratedFile(path),
		opener: {
			getFile: (path) => app.vault.getAbstractFileByPath(path),
			isOpenableFile: (file): file is TFile => file instanceof TFile,
			openFile: (file) => app.workspace.getLeaf('tab').openFile(file),
		},
	});
}
