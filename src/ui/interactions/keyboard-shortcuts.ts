export interface ConnectionUndoShortcutInput {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	connectionUndoCount: number;
	editableTarget: boolean;
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
