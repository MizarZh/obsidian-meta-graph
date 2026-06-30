import type { DockTemplateNode } from '../core/types';

export interface TemplateNoteRequest {
	template: DockTemplateNode;
	title: string;
}

export function resolveTemplateNoteRequest(
	templates: DockTemplateNode[],
	templateId: string,
	name: string,
): TemplateNoteRequest {
	const template = templates.find((item) => item.id === templateId);
	if (!template) {
		throw new Error('Template is missing.');
	}
	const title = name.trim();
	if (!title) {
		throw new Error('Note name is required.');
	}
	return { template, title };
}
