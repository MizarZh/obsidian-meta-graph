import type { App } from 'obsidian';
import type {
	DebugSnapshot,
	DockConnectionDirection,
	WorkspaceState,
} from '../../core/types';
import { CreateFromTemplateModal } from '../CreateFromTemplateModal';
import { findDockTemplateLabel, findIndexedNodeTitle } from './derived';
import {
	openCreatedTemplateNote,
	type CreatedTemplateNoteOpener,
} from './template-actions';

export interface WorkspaceTemplateNoteOptions<
	FileEntry,
	OpenableFile extends FileEntry,
> {
	app: App;
	templateId: string;
	targetNodeId: string;
	label?: string;
	direction: DockConnectionDirection;
	templates: WorkspaceState['dock']['templates'];
	debugSnapshot: DebugSnapshot;
	activeConnectionField: string;
	openInNewTab: boolean;
	createNoteFromTemplate(
		templateId: string,
		targetNodeId: string,
		name: string,
		direction: DockConnectionDirection,
		connectionField: string,
	): Promise<string | undefined>;
	addCuratedFile(path: string): void;
	opener: CreatedTemplateNoteOpener<FileEntry, OpenableFile>;
}

export async function openWorkspaceTemplateNote<
	FileEntry,
	OpenableFile extends FileEntry,
>(
	options: WorkspaceTemplateNoteOptions<FileEntry, OpenableFile>,
): Promise<void> {
	const label =
		options.label ??
		findDockTemplateLabel(options.templates, options.templateId);
	if (!label) {
		return;
	}
	const filePath = await new Promise<string | undefined>((resolve) => {
		new CreateFromTemplateModal(
			options.app,
			label,
			findIndexedNodeTitle(options.debugSnapshot, options.targetNodeId),
			async (name) => {
				const path = await options.createNoteFromTemplate(
					options.templateId,
					options.targetNodeId,
					name,
					options.direction,
					options.activeConnectionField,
				);
				resolve(path);
			},
		).open();
	});
	if (filePath) {
		options.addCuratedFile(filePath);
	}
	await openCreatedTemplateNote(filePath, options.openInNewTab, options.opener);
}
