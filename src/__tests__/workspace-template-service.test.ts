import { describe, expect, it } from 'vitest';
import type { DockTemplateNode } from '../core/types';
import { resolveTemplateNoteRequest } from '../workspace/workspace-template-request';

const template: DockTemplateNode = {
	id: 'template-1',
	label: 'Template',
	templatePath: 'Templates/Note.md',
	targetFolder: 'Notes',
	relationField: 'leads-to',
	direction: 'from-dock-to-graph',
	defaultGroupId: 'group-1',
};

describe('workspace template service', () => {
	it('resolves template note requests with trimmed titles', () => {
		expect(resolveTemplateNoteRequest([template], 'template-1', '  New note  ')).toEqual({
			template,
			title: 'New note',
		});
	});

	it('throws when the template is missing', () => {
		expect(() =>
			resolveTemplateNoteRequest([template], 'missing', 'New note'),
		).toThrow('Template is missing.');
	});

	it('throws when the note title is empty', () => {
		expect(() =>
			resolveTemplateNoteRequest([template], 'template-1', '   '),
		).toThrow('Note name is required.');
	});
});
