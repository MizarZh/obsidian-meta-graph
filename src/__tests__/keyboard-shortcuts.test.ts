import { describe, expect, it } from 'vitest';
import {
	shouldHandleConnectionUndoShortcut,
	shouldHandleFindNoteShortcut,
} from '../ui/interactions/keyboard-shortcuts';

describe('find note shortcut', () => {
	it('handles Ctrl+F and Cmd+F', () => {
		expect(shouldHandleFindNoteShortcut(findInput({ ctrlKey: true }))).toBe(
			true,
		);
		expect(shouldHandleFindNoteShortcut(findInput({ metaKey: true }))).toBe(
			true,
		);
	});

	it('ignores other keys and modified shortcuts', () => {
		expect(
			shouldHandleFindNoteShortcut(
				findInput({ ctrlKey: true, altKey: true }),
			),
		).toBe(false);
		expect(
			shouldHandleFindNoteShortcut(
				findInput({ ctrlKey: true, shiftKey: true }),
			),
		).toBe(false);
		expect(
			shouldHandleFindNoteShortcut(
				findInput({ ctrlKey: true, key: 'g' }),
			),
		).toBe(false);
	});
});

describe('connection undo shortcut', () => {
	it('handles Ctrl+Z and Cmd+Z with pending undo entries', () => {
		expect(
			shouldHandleConnectionUndoShortcut(input({ ctrlKey: true })),
		).toBe(true);
		expect(
			shouldHandleConnectionUndoShortcut(input({ metaKey: true })),
		).toBe(true);
	});

	it('ignores modified, editable, or unavailable shortcut states', () => {
		expect(
			shouldHandleConnectionUndoShortcut(input({ altKey: true })),
		).toBe(false);
		expect(
			shouldHandleConnectionUndoShortcut(input({ shiftKey: true })),
		).toBe(false);
		expect(
			shouldHandleConnectionUndoShortcut(
				input({ connectionUndoCount: 0 }),
			),
		).toBe(false);
		expect(
			shouldHandleConnectionUndoShortcut(input({ editableTarget: true })),
		).toBe(false);
		expect(shouldHandleConnectionUndoShortcut(input({ key: 'x' }))).toBe(
			false,
		);
	});
});

function input(
	overrides: Partial<
		Parameters<typeof shouldHandleConnectionUndoShortcut>[0]
	>,
): Parameters<typeof shouldHandleConnectionUndoShortcut>[0] {
	return {
		key: 'z',
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		connectionUndoCount: 1,
		editableTarget: false,
		...overrides,
	};
}

function findInput(
	overrides: Partial<Parameters<typeof shouldHandleFindNoteShortcut>[0]>,
): Parameters<typeof shouldHandleFindNoteShortcut>[0] {
	return {
		key: 'f',
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	};
}
