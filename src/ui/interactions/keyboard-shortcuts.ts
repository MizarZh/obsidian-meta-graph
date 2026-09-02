export type WorkspaceActionId =
	| 'find-note'
	| 'undo'
	| 'redo'
	| 'open-selected'
	| 'toggle-pinned-focus'
	| 'fit-graph'
	| 'reset-zoom'
	| 'zoom-in'
	| 'zoom-out'
	| 'refresh-graph'
	| 'show-shortcuts'
	| 'escape'
	| 'toggle-dock'
	| 'toggle-curated-panel'
	| 'toggle-connection-panel'
	| 'previous-view'
	| 'next-view';

export interface WorkspaceActionDefinition {
	id: WorkspaceActionId;
	label: string;
	shortcut?: string;
	group: 'Navigation' | 'Selection' | 'History' | 'Panels';
}

export const WORKSPACE_ACTION_DEFINITIONS: readonly WorkspaceActionDefinition[] =
	[
		{
			id: 'find-note',
			label: 'Find note',
			shortcut: 'Mod+F',
			group: 'Navigation',
		},
		{
			id: 'open-selected',
			label: 'Open selected note',
			shortcut: 'Enter',
			group: 'Selection',
		},
		{
			id: 'toggle-pinned-focus',
			label: 'Pin or unpin neighborhood',
			shortcut: 'Space',
			group: 'Selection',
		},
		{
			id: 'fit-graph',
			label: 'Fit graph',
			shortcut: '0',
			group: 'Navigation',
		},
		{
			id: 'reset-zoom',
			label: 'Reset zoom to 100%',
			shortcut: '1',
			group: 'Navigation',
		},
		{ id: 'zoom-in', label: 'Zoom in', shortcut: '+', group: 'Navigation' },
		{
			id: 'zoom-out',
			label: 'Zoom out',
			shortcut: '-',
			group: 'Navigation',
		},
		{
			id: 'refresh-graph',
			label: 'Refresh and relayout graph',
			shortcut: 'Shift+R',
			group: 'Navigation',
		},
		{
			id: 'undo',
			label: 'Undo last connection',
			shortcut: 'Mod+Z',
			group: 'History',
		},
		{
			id: 'redo',
			label: 'Redo last connection',
			shortcut: 'Mod+Shift+Z / Mod+Y',
			group: 'History',
		},
		{
			id: 'show-shortcuts',
			label: 'Toggle keyboard shortcuts',
			shortcut: '?',
			group: 'Navigation',
		},
		{
			id: 'escape',
			label: 'Close or clear current context',
			shortcut: 'Esc',
			group: 'Navigation',
		},
		{ id: 'toggle-dock', label: 'Toggle right panel', group: 'Panels' },
		{
			id: 'toggle-curated-panel',
			label: 'Toggle workspace files',
			group: 'Panels',
		},
		{
			id: 'toggle-connection-panel',
			label: 'Toggle connections',
			group: 'Panels',
		},
		{
			id: 'previous-view',
			label: 'Previous graph view',
			group: 'Navigation',
		},
		{ id: 'next-view', label: 'Next graph view', group: 'Navigation' },
	];

export interface WorkspaceShortcutInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	connectionUndoCount: number;
	connectionRedoCount?: number;
	editableTarget: boolean;
	selectedNodeId?: string;
	hoveredNodeId?: string;
}

export interface ConnectionUndoShortcutInput extends WorkspaceShortcutInput {}

export type FindNoteShortcutInput = Pick<
	ConnectionUndoShortcutInput,
	'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>;

export function shouldHandleFindNoteShortcut(
	input: FindNoteShortcutInput,
): boolean {
	return (
		(input.ctrlKey || input.metaKey) &&
		!input.altKey &&
		!input.shiftKey &&
		input.key.toLocaleLowerCase() === 'f'
	);
}

export function shouldHandleConnectionUndoShortcut(
	input: ConnectionUndoShortcutInput,
): boolean {
	return resolveWorkspaceShortcut(input) === 'undo';
}

export function resolveWorkspaceShortcut(
	input: WorkspaceShortcutInput,
): WorkspaceActionId | undefined {
	const key = input.key.toLocaleLowerCase();
	const mod = input.ctrlKey || input.metaKey;
	if (mod && !input.altKey && !input.shiftKey && key === 'f') {
		return 'find-note';
	}
	if (input.editableTarget) return undefined;
	if (!input.altKey && mod && (key === 'z' || key === 'y')) {
		if (key === 'y' && !input.shiftKey) {
			return (input.connectionRedoCount ?? 0) > 0 ? 'redo' : undefined;
		}
		if (input.shiftKey) {
			return (input.connectionRedoCount ?? 0) > 0 ? 'redo' : undefined;
		}
		return input.connectionUndoCount > 0 ? 'undo' : undefined;
	}
	if (input.ctrlKey || input.metaKey || input.altKey) return undefined;
	if (!input.shiftKey && key === 'escape') return 'escape';
	if (!input.shiftKey && key === 'enter' && input.selectedNodeId) {
		return 'open-selected';
	}
	if (!input.shiftKey && (key === ' ' || key === 'spacebar')) {
		return 'toggle-pinned-focus';
	}
	if (!input.shiftKey && key === '0') return 'fit-graph';
	if (!input.shiftKey && key === '1') return 'reset-zoom';
	if (key === '+' || (!input.shiftKey && key === '=')) return 'zoom-in';
	if (!input.shiftKey && (key === '-' || key === '_')) return 'zoom-out';
	if (input.shiftKey && key === 'r') return 'refresh-graph';
	if (key === '?' || (input.shiftKey && key === '/')) {
		return 'show-shortcuts';
	}
	return undefined;
}
