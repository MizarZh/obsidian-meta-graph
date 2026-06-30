import { describe, expect, it } from 'vitest';
import { shouldHandleConnectionUndoShortcut } from '../ui/interactions/keyboard-shortcuts';

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
