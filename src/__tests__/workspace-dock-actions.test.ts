import { describe, expect, it } from 'vitest';
import {
	addDockNoteInState,
	addDockTemplateInState,
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
