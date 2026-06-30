import type {
	DockConnectionDirection,
	DockTemplateNode,
	NodeId,
} from '../../core/types';
import { resolveTemplateNoteRequest } from './template-request';

type TemplateNoteFile = { path: NodeId };
type TemplateNoteCreator = (
	template: DockTemplateNode,
	title: string,
) => Promise<TemplateNoteFile>;

export interface CreateWorkspaceTemplateNoteOptions {
	templates: DockTemplateNode[];
	templateId: string;
	targetNodeId: NodeId;
	name: string;
	direction: DockConnectionDirection;
	field: string;
	connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection,
		field: string,
	): Promise<void>;
	placeTemplateNoteInDefaultGroup(path: NodeId, groupId?: string): void;
	createNoteFile: TemplateNoteCreator;
}

export async function createWorkspaceTemplateNote(
	options: CreateWorkspaceTemplateNoteOptions,
): Promise<NodeId> {
	const { template, title } = resolveTemplateNoteRequest(
		options.templates,
		options.templateId,
		options.name,
	);
	const file = await options.createNoteFile(template, title);

	await options.connectDockNote(
		file.path,
		options.targetNodeId,
		options.direction,
		options.field,
	);
	options.placeTemplateNoteInDefaultGroup(file.path, template.defaultGroupId);
	return file.path;
}
