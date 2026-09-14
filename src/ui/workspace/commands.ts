import type { WorkspaceState } from '@/core/types';
import type { WorkspaceController } from '@/workspace/workspace-controller';
import type { WorkspaceRendererLifecycle } from '@/ui/workspace/renderer-lifecycle';
import { formatError as formatErrorMessage } from '@/core/errors';
import {
	resolvePinnedFocusNodeId,
	resolveWorkspaceShortcut,
	type WorkspaceActionId,
} from '@/ui/interactions/keyboard-shortcuts';

export interface WorkspaceCommandContext {
	readonly state: WorkspaceState;
	readonly readOnly: boolean;
	readonly findNoteInput: HTMLInputElement | undefined;
	readonly hoveredNodeId: string | undefined;
	readonly controller: Pick<
		WorkspaceController,
		| 'undoLastConnection'
		| 'redoLastConnection'
		| 'setRendererDebugState'
		| 'refresh'
	>;
	viewport: Pick<
		WorkspaceRendererLifecycle,
		| 'togglePinnedHover'
		| 'clearPinnedHover'
		| 'fit'
		| 'setZoomLevel'
		| 'zoomIn'
		| 'zoomOut'
	>;
	openNote(nodeId: string): Promise<void>;
	switchActiveChart(id: string): Promise<void>;
	panels: {
		toggleDock(): void;
		toggleCuratedPanel(): void;
		toggleConnection(): void;
		toggleShortcutHelp(): void;
		dismissContext(): void;
	};
}

export function createWorkspaceCommands(context: WorkspaceCommandContext) {
	function handleWorkspaceKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented) return;
		const action = resolveWorkspaceShortcut({
			key: event.key,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
			altKey: event.altKey,
			shiftKey: event.shiftKey,
			connectionUndoCount: context.state.connectionUndoCount,
			connectionRedoCount: context.state.connectionRedoCount,
			editableTarget: isEditableTarget(event.target),
			selectedNodeId: context.state.selectedNodeId,
			hoveredNodeId: context.hoveredNodeId,
		});
		if (!action || !executeWorkspaceAction(action)) return;
		event.preventDefault();
		event.stopPropagation();
	}

	function undoLastConnection(): void {
		if (context.state.connectionUndoCount === 0) return;
		void context.controller.undoLastConnection().catch((error: unknown) =>
			context.controller.setRendererDebugState({
				status: 'error',
				error: formatErrorMessage(error, { includeStack: true }),
			}),
		);
	}

	function redoLastConnection(): void {
		if (context.state.connectionRedoCount === 0) return;
		void context.controller.redoLastConnection().catch((error: unknown) =>
			context.controller.setRendererDebugState({
				status: 'error',
				error: formatErrorMessage(error, { includeStack: true }),
			}),
		);
	}

	function focusFindNoteInput(): boolean {
		if (!context.findNoteInput) return false;
		context.findNoteInput.focus({ preventScroll: true });
		context.findNoteInput.select();
		return true;
	}

	function canExecuteWorkspaceAction(action: WorkspaceActionId): boolean {
		if (action === 'find-note') return Boolean(context.findNoteInput);
		if (action === 'undo')
			return !context.readOnly && context.state.connectionUndoCount > 0;
		if (action === 'redo')
			return !context.readOnly && context.state.connectionRedoCount > 0;
		if (action === 'open-selected') {
			return Boolean(context.state.selectedNodeId);
		}
		if (action === 'previous-view' || action === 'next-view') {
			return context.state.charts.length > 1;
		}
		return true;
	}

	function executeWorkspaceAction(action: WorkspaceActionId): boolean {
		if (!canExecuteWorkspaceAction(action)) return false;
		switch (action) {
			case 'find-note':
				return focusFindNoteInput();
			case 'undo':
				undoLastConnection();
				return true;
			case 'redo':
				redoLastConnection();
				return true;
			case 'open-selected':
				void context.openNote(context.state.selectedNodeId!);
				return true;
			case 'toggle-pinned-focus':
				{
					const nodeId = resolvePinnedFocusNodeId({
						selectedNodeId: context.state.selectedNodeId,
						hoveredNodeId: context.hoveredNodeId,
					});
					if (nodeId) {
						context.viewport.togglePinnedHover(nodeId);
					} else {
						context.viewport.clearPinnedHover();
					}
				}
				return true;
			case 'fit-graph':
				context.viewport.fit();
				return true;
			case 'reset-zoom':
				context.viewport.setZoomLevel(100);
				return true;
			case 'zoom-in':
				context.viewport.zoomIn();
				return true;
			case 'zoom-out':
				context.viewport.zoomOut();
				return true;
			case 'refresh-graph':
				void context.controller.refresh(false);
				return true;
			case 'show-shortcuts':
				context.panels.toggleShortcutHelp();
				return true;
			case 'toggle-dock':
				context.panels.toggleDock();
				return true;
			case 'toggle-curated-panel':
				context.panels.toggleCuratedPanel();
				return true;
			case 'toggle-connection-panel':
				context.panels.toggleConnection();
				return true;
			case 'previous-view':
			case 'next-view': {
				const index = context.state.charts.findIndex(
					(chart) => chart.id === context.state.activeChartId,
				);
				const delta = action === 'previous-view' ? -1 : 1;
				const next =
					context.state.charts[
						(index + delta + context.state.charts.length) %
							context.state.charts.length
					];
				if (next) void context.switchActiveChart(next.id);
				return Boolean(next);
			}
			case 'escape':
				context.panels.dismissContext();
				return true;
		}
	}

	return {
		canExecute: canExecuteWorkspaceAction,
		execute: executeWorkspaceAction,
		handleKeydown: handleWorkspaceKeydown,
		undo: undoLastConnection,
		redo: redoLastConnection,
	};
}
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return Boolean(
		target.closest(
			'input, textarea, select, button, [contenteditable="true"]',
		),
	);
}
