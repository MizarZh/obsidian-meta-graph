import { describe, expect, it, vi } from 'vitest';
import type { DockTemplateNode } from '../core/types';
import { createWorkspaceTemplateNote } from '../workspace/actions/template-actions';

describe('workspace template note actions', () => {
	it('creates, connects, places, and returns the new template note path', async () => {
		const events: string[] = [];
		const template = createTemplate({
			defaultGroupId: 'group-a',
		});
		const createNoteFile = vi.fn(async () => {
			events.push('create');
			return { path: 'Created.md' };
		});
		const connectDockNote = vi.fn(async () => {
			events.push('connect');
		});
		const placeTemplateNoteInDefaultGroup = vi.fn(() => {
			events.push('place');
		});

		const path = await createWorkspaceTemplateNote({
			templates: [template],
			templateId: template.id,
			targetNodeId: 'Target.md',
			name: 'Created',
			direction: 'from-dock-to-graph',
			field: 'leads-to',
			createNoteFile,
			connectDockNote,
			placeTemplateNoteInDefaultGroup,
		});

		expect(path).toBe('Created.md');
		expect(createNoteFile).toHaveBeenCalledWith(template, 'Created');
		expect(connectDockNote).toHaveBeenCalledWith(
			'Created.md',
			'Target.md',
			'from-dock-to-graph',
			'leads-to',
		);
		expect(placeTemplateNoteInDefaultGroup).toHaveBeenCalledWith(
			'Created.md',
			'group-a',
		);
		expect(events).toEqual(['create', 'connect', 'place']);
	});

	it('uses resolved and trimmed template titles', async () => {
		const createNoteFile = vi.fn(async () => ({ path: 'Fallback.md' }));

		await createWorkspaceTemplateNote({
			templates: [createTemplate({ label: 'Fallback label' })],
			templateId: 'template-a',
			targetNodeId: 'Target.md',
			name: '  Created note  ',
			direction: 'from-dock-to-graph',
			field: 'leads-to',
			createNoteFile,
			connectDockNote: async () => {},
			placeTemplateNoteInDefaultGroup: () => {},
		});

		expect(createNoteFile).toHaveBeenCalledWith(
			expect.anything(),
			'Created note',
		);
	});
});

function createTemplate(
	patch: Partial<DockTemplateNode> = {},
): DockTemplateNode {
	return {
		id: 'template-a',
		label: 'Template A',
		templatePath: 'Templates/A.md',
		targetFolder: 'Notes',
		relationField: 'leads-to',
		direction: 'from-dock-to-graph',
		...patch,
	};
}
