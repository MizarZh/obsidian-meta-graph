export interface ConnectionUndoShortcutInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	connectionUndoCount: number;
	editableTarget: boolean;
}

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
	return (
		(input.ctrlKey || input.metaKey) &&
		!input.altKey &&
		!input.shiftKey &&
		input.key.toLocaleLowerCase() === 'z' &&
		input.connectionUndoCount > 0 &&
		!input.editableTarget
	);
}
