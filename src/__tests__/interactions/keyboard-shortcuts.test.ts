import { describe, expect, it } from 'vitest';
import {
	resolvePinnedFocusNodeId,
	resolveWorkspaceShortcut,
} from '@/ui/interactions/keyboard-shortcuts';

describe('find note shortcut', () => {
	it('handles Ctrl+F and Cmd+F', () => {
		expect(resolveWorkspaceShortcut(findInput({ ctrlKey: true }))).toBe(
			'find-note',
		);
		expect(resolveWorkspaceShortcut(findInput({ metaKey: true }))).toBe(
			'find-note',
		);
	});

	it('ignores other keys and modified shortcuts', () => {
		expect(
			resolveWorkspaceShortcut(
				findInput({ ctrlKey: true, altKey: true }),
			),
		).not.toBe('find-note');
		expect(
			resolveWorkspaceShortcut(
				findInput({ ctrlKey: true, shiftKey: true }),
			),
		).not.toBe('find-note');
		expect(
			resolveWorkspaceShortcut(findInput({ ctrlKey: true, key: 'g' })),
		).not.toBe('find-note');
	});
});

describe('connection undo shortcut', () => {
	it('handles Ctrl+Z and Cmd+Z with pending undo entries', () => {
		expect(resolveWorkspaceShortcut(input({ ctrlKey: true }))).toBe('undo');
		expect(resolveWorkspaceShortcut(input({ metaKey: true }))).toBe('undo');
	});

	it('ignores modified, editable, or unavailable shortcut states', () => {
		expect(resolveWorkspaceShortcut(input({ altKey: true }))).not.toBe(
			'undo',
		);
		expect(resolveWorkspaceShortcut(input({ shiftKey: true }))).not.toBe(
			'undo',
		);
		expect(
			resolveWorkspaceShortcut(input({ connectionUndoCount: 0 })),
		).not.toBe('undo');
		expect(
			resolveWorkspaceShortcut(input({ editableTarget: true })),
		).not.toBe('undo');
		expect(resolveWorkspaceShortcut(input({ key: 'x' }))).not.toBe('undo');
	});
});

describe('workspace shortcuts', () => {
	it('uses the hovered node before the selected node for pinned focus', () => {
		expect(
			resolvePinnedFocusNodeId({
				selectedNodeId: 'selected.md',
				hoveredNodeId: 'hovered.md',
			}),
		).toBe('hovered.md');
		expect(
			resolvePinnedFocusNodeId({ selectedNodeId: 'selected.md' }),
		).toBe('selected.md');
		expect(resolvePinnedFocusNodeId({})).toBeUndefined();
	});

	it('maps selection, viewport, refresh, and help keys', () => {
		expect(
			resolveWorkspaceShortcut(
				input({ key: 'Enter', selectedNodeId: 'A.md' }),
			),
		).toBe('open-selected');
		expect(
			resolveWorkspaceShortcut(
				input({ key: ' ', selectedNodeId: 'A.md' }),
			),
		).toBe('toggle-pinned-focus');
		expect(
			resolveWorkspaceShortcut(
				input({ key: ' ', hoveredNodeId: 'B.md' }),
			),
		).toBe('toggle-pinned-focus');
		expect(resolveWorkspaceShortcut(input({ key: ' ' }))).toBe(
			'toggle-pinned-focus',
		);
		expect(resolveWorkspaceShortcut(input({ key: '0' }))).toBe('fit-graph');
		expect(resolveWorkspaceShortcut(input({ key: '1' }))).toBe(
			'reset-zoom',
		);
		expect(
			resolveWorkspaceShortcut(input({ key: 'R', shiftKey: true })),
		).toBe('refresh-graph');
		expect(resolveWorkspaceShortcut(input({ key: '?' }))).toBe(
			'show-shortcuts',
		);
	});

	it('maps redo only when history exists and leaves editable controls alone', () => {
		expect(
			resolveWorkspaceShortcut(
				input({
					metaKey: true,
					shiftKey: true,
					connectionRedoCount: 1,
				}),
			),
		).toBe('redo');
		expect(
			resolveWorkspaceShortcut(
				input({
					metaKey: true,
					shiftKey: true,
					connectionRedoCount: 0,
				}),
			),
		).toBeUndefined();
		expect(
			resolveWorkspaceShortcut(input({ key: '0', editableTarget: true })),
		).toBeUndefined();
	});
});

function input(
	overrides: Partial<Parameters<typeof resolveWorkspaceShortcut>[0]>,
): Parameters<typeof resolveWorkspaceShortcut>[0] {
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
	overrides: Partial<Parameters<typeof resolveWorkspaceShortcut>[0]>,
): Parameters<typeof resolveWorkspaceShortcut>[0] {
	return {
		...input({}),
		key: 'f',
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		...overrides,
	};
}
