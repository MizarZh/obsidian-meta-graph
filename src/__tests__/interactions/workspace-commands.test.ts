import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createWorkspaceCommands,
	type WorkspaceCommandContext,
} from '@/ui/workspace/commands';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

function setup() {
	const context = {
		state: createWorkspaceState(200),
		readOnly: false as boolean,
		findNoteInput: undefined,
		hoveredNodeId: undefined,
		controller: {
			undoLastConnection: vi.fn().mockResolvedValue(undefined),
			redoLastConnection: vi.fn().mockResolvedValue(undefined),
			setRendererDebugState: vi.fn(),
			refresh: vi.fn().mockResolvedValue(undefined),
		},
		viewport: {
			togglePinnedHover: vi.fn(),
			clearPinnedHover: vi.fn(),
			fit: vi.fn(),
			setZoomLevel: vi.fn(),
			zoomIn: vi.fn(),
			zoomOut: vi.fn(),
		},
		openNote: vi.fn().mockResolvedValue(undefined),
		switchActiveChart: vi.fn().mockResolvedValue(undefined),
		panels: {
			toggleDock: vi.fn(),
			toggleCuratedPanel: vi.fn(),
			toggleConnection: vi.fn(),
			toggleShortcutHelp: vi.fn(),
			dismissContext: vi.fn(),
		},
	} satisfies WorkspaceCommandContext;
	return { context, commands: createWorkspaceCommands(context) };
}
afterEach(() => vi.unstubAllGlobals());
describe('workspace command host', () => {
	it('refreshes data without forcing layout through the refresh shortcut action', () => {
		const { context, commands } = setup();
		expect(commands.execute('refresh-graph')).toBe(true);
		expect(context.controller.refresh).toHaveBeenCalledWith(false);
	});
	it('reads replacement state for availability, selection and view cycling', () => {
		const { context, commands } = setup();
		expect(commands.canExecute('open-selected')).toBe(false);
		context.state = {
			...context.state,
			charts: [context.state.charts[0]!],
		};
		expect(commands.execute('next-view')).toBe(false);
		context.state = {
			...context.state,
			selectedNodeId: 'new.md',
			charts: [
				context.state.charts[0]!,
				{ ...context.state.charts[0]!, id: 'second' },
			],
		};
		expect(commands.execute('open-selected')).toBe(true);
		expect(context.openNote).toHaveBeenCalledWith('new.md');
		commands.execute('previous-view');
		expect(context.switchActiveChart).toHaveBeenCalledWith('second');
	});
	it('honors read-only and history counts; reports rejected undo with stack', async () => {
		const { context, commands } = setup();
		expect(commands.execute('undo')).toBe(false);
		context.state = { ...context.state, connectionUndoCount: 1 };
		context.readOnly = true;
		expect(commands.execute('undo')).toBe(false);
		expect(context.controller.undoLastConnection).not.toHaveBeenCalled();
		context.readOnly = false;
		const error = new Error('write failed');
		context.controller.undoLastConnection.mockRejectedValueOnce(error);
		expect(commands.execute('undo')).toBe(true);
		await Promise.resolve();
		expect(context.controller.setRendererDebugState).toHaveBeenCalledWith({
			status: 'error',
			error: `Error: write failed\n${error.stack}`,
		});
	});
	it('consumes shortcuts only after successful execution', () => {
		vi.stubGlobal('HTMLElement', class {});
		const { context, commands } = setup();
		const preventDefault = vi.fn();
		const stopPropagation = vi.fn();
		const event = {
			key: 'z',
			ctrlKey: true,
			metaKey: false,
			altKey: false,
			shiftKey: false,
			defaultPrevented: false,
			target: null,
			preventDefault,
			stopPropagation,
		} as unknown as KeyboardEvent;
		commands.handleKeydown(event);
		expect(preventDefault).not.toHaveBeenCalled();
		context.state = { ...context.state, connectionUndoCount: 1 };
		commands.handleKeydown(event);
		expect(context.controller.undoLastConnection).toHaveBeenCalledOnce();
		expect(preventDefault).toHaveBeenCalledOnce();
		expect(stopPropagation).toHaveBeenCalledOnce();
	});
	it('ignores editable targets and events already handled by another control', () => {
		class Editable {
			closest() {
				return this;
			}
		}
		vi.stubGlobal('HTMLElement', Editable);
		const { context, commands } = setup();
		context.state = { ...context.state, connectionUndoCount: 1 };
		const event = {
			key: 'z',
			ctrlKey: true,
			target: new Editable(),
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		} as unknown as KeyboardEvent;
		commands.handleKeydown(event);
		commands.handleKeydown({
			...event,
			target: null,
			defaultPrevented: true,
		});
		expect(context.controller.undoLastConnection).not.toHaveBeenCalled();
	});
	it('delegates Escape to UI owner and clears focus when no node is available', () => {
		const { context, commands } = setup();
		commands.execute('escape');
		expect(context.panels.dismissContext).toHaveBeenCalledOnce();
		commands.execute('toggle-pinned-focus');
		expect(context.viewport.clearPinnedHover).toHaveBeenCalledOnce();
		context.state = { ...context.state, selectedNodeId: 'selected.md' };
		commands.execute('toggle-pinned-focus');
		expect(context.viewport.togglePinnedHover).toHaveBeenCalledWith(
			'selected.md',
		);
	});
});
