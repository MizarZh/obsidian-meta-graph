import { describe, expect, it } from 'vitest';
import {
	addDockNoteInState,
	addDockTemplateInState,
	reorderDockNotesInState,
	reorderDockTemplatesInState,
	setDockWidthInState,
	updateDockNotePathInState,
} from '../workspace/actions/dock-actions';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace dock actions', () => {
	it('adds dock templates through workspace state', () => {
		const state = createWorkspaceState(100);

		const nextState = addDockTemplateInState(state, {
			label: 'Template',
			templatePath: 'Templates/Note.md',
			targetFolder: 'Notes',
			relationField: 'leads-to',
			direction: 'from-dock-to-graph',
			defaultGroupId: '',
		});

		expect(nextState.dock.templates).toHaveLength(1);
		expect(nextState.dock.templates[0]).toMatchObject({
			label: 'Template',
			templatePath: 'Templates/Note.md',
		});
		expect(nextState.charts).toBe(state.charts);
	});

	it('renames dock notes after normalizing paths', () => {
		const state = addDockNoteInState(createWorkspaceState(100), 'Old.md');

		const result = updateDockNotePathInState(state, 'Old.md', 'New.md');

		expect(result.changed).toBe(true);
		expect(result.state.dock.notes[0]?.path).toBe('New.md');
	});

	it('reorders dock notes from a complete ordered path list', () => {
		const state = ['A.md', 'B.md', 'C.md'].reduce(
			(nextState, path) => addDockNoteInState(nextState, path),
			createWorkspaceState(100),
		);

		const result = reorderDockNotesInState(state, ['C.md', 'A.md', 'B.md']);

		expect(result.dock.notes.map((note) => note.path)).toEqual([
			'C.md',
			'A.md',
			'B.md',
		]);
		expect(reorderDockNotesInState(result, ['C.md', 'A.md'])).toBe(result);
	});

	it('reorders dock templates from a complete ordered id list', () => {
		const state = ['First', 'Second', 'Third'].reduce(
			(nextState, label) =>
				addDockTemplateInState(nextState, {
					label,
					templatePath: `${label}.md`,
					targetFolder: '',
					relationField: 'leads-to',
					direction: 'from-dock-to-graph',
					defaultGroupId: '',
				}),
			createWorkspaceState(100),
		);
		const templateIds = state.dock.templates.map((template) => template.id);

		const result = reorderDockTemplatesInState(state, [
			templateIds[2] ?? '',
			templateIds[0] ?? '',
			templateIds[1] ?? '',
		]);

		expect(result.dock.templates.map((template) => template.label)).toEqual(
			['Third', 'First', 'Second'],
		);
		expect(
			reorderDockTemplatesInState(result, templateIds.slice(0, 2)),
		).toBe(result);
	});

	it('keeps unchanged dock note paths referentially stable', () => {
		const state = addDockNoteInState(createWorkspaceState(100), 'Old.md');

		const result = updateDockNotePathInState(state, 'Old.md', 'Old.md');

		expect(result.changed).toBe(false);
		expect(result.state).toBe(state);
	});

	it('keeps no-op dock width updates referentially stable', () => {
		const state = createWorkspaceState(100);

		expect(setDockWidthInState(state, state.dock.dockWidth)).toBe(state);
	});
});
