import { describe, expect, it, vi } from 'vitest';
import type { ConnectionFieldMode, NodeId } from '../core/types';
import {
	completeConnectionChangeInState,
	connectPreparedNodesInState,
	prepareConnectDockNoteInState,
	prepareConnectNodesInState,
	redoLastConnectionInState,
	undoLastConnectionInState,
	type WorkspaceConnectionPort,
} from '../workspace/actions/connection-actions';
import { addConnectionFieldAndSelectInState } from '../workspace/state/connection-fields';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace connection actions', () => {
	it('preserves the exact active paired connection spec', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'prerequisite',
			'paired',
			'next',
		).state;

		expect(
			prepareConnectNodesInState(
				state,
				'Source.md',
				'Target.md',
				'prerequisite',
			),
		).toMatchObject({ mode: 'paired', reverseField: 'next' });
	});

	it('rejects requests for unpinned metadata', () => {
		const action = prepareConnectNodesInState(
			createWorkspaceState(100),
			'Source.md',
			'Target.md',
			' supports ',
		);

		expect(action).toBeNull();
	});

	it('prepares dock connection direction and active field mode', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'reverse',
		).state;

		const action = prepareConnectDockNoteInState(
			state,
			'Dock.md',
			'Graph.md',
			'from-graph-to-dock',
			'supports',
		);

		expect(action?.request).toEqual({
			sourceNodeId: 'Graph.md',
			targetNodeId: 'Dock.md',
			field: 'supports',
		});
		expect(action?.mode).toBe('reverse');
	});

	it('runs prepared connections through the service and requests flow relayout', async () => {
		const connectionState = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'leads-to',
			'directed',
		).state;
		const state = { ...connectionState, mode: 'flow' as const };
		const action = prepareConnectNodesInState(
			state,
			'Source.md',
			'Target.md',
			'leads-to',
		);
		if (!action) {
			throw new Error('Expected prepared action.');
		}
		const service = createConnectionService(true, 3);

		const result = await connectPreparedNodesInState(
			{ ...action.state, mode: 'flow' },
			service,
			action,
			true,
		);

		expect(service.connectNodesMock).toHaveBeenCalledWith(
			'Source.md',
			'Target.md',
			'leads-to',
			'directed',
		);
		expect(result).toMatchObject({
			changed: true,
			refresh: true,
			forceLayout: true,
		});
		expect(result.state.connectionUndoCount).toBe(3);
		expect(result.state.connectionRedoCount).toBe(0);
	});

	it('updates undo count after undo without forcing refresh when nothing changed', async () => {
		const state = { ...createWorkspaceState(100), connectionUndoCount: 2 };
		const service = createConnectionService(false, 1);

		const result = await undoLastConnectionInState(state, service);

		expect(service.undoLastConnectionMock).toHaveBeenCalled();
		expect(result).toMatchObject({
			changed: false,
			refresh: false,
			forceLayout: false,
		});
		expect(result.state.connectionUndoCount).toBe(1);
	});

	it('updates both history counts after redo', async () => {
		const state = { ...createWorkspaceState(100), connectionRedoCount: 1 };
		const service = createConnectionService(true, 2, 0);

		const result = await redoLastConnectionInState(state, service);

		expect(service.redoLastConnectionMock).toHaveBeenCalled();
		expect(result).toMatchObject({
			changed: true,
			refresh: true,
			forceLayout: false,
		});
		expect(result.state.connectionUndoCount).toBe(2);
		expect(result.state.connectionRedoCount).toBe(0);
	});

	it('keeps unchanged connection results stable', () => {
		const state = createWorkspaceState(100);

		expect(completeConnectionChangeInState(state, false, 0, true)).toEqual({
			state,
			changed: false,
			refresh: false,
			forceLayout: false,
		});
	});
});

function createConnectionService(
	changed: boolean,
	undoCount: number,
	redoCount = 0,
): WorkspaceConnectionPort & {
	connectNodesMock: ReturnType<typeof vi.fn>;
	undoLastConnectionMock: ReturnType<typeof vi.fn>;
	redoLastConnectionMock: ReturnType<typeof vi.fn>;
} {
	const connectNodesMock = vi.fn(
		(
			_sourceNodeId: NodeId,
			_targetNodeId: NodeId,
			_field: string,
			_mode: ConnectionFieldMode,
		) => Promise.resolve(changed),
	);
	const undoLastConnectionMock = vi.fn(() => Promise.resolve(changed));
	const redoLastConnectionMock = vi.fn(() => Promise.resolve(changed));
	return {
		undoCount,
		redoCount,
		connectNodes: connectNodesMock,
		undoLastConnection: undoLastConnectionMock,
		redoLastConnection: redoLastConnectionMock,
		connectNodesMock,
		undoLastConnectionMock,
		redoLastConnectionMock,
	};
}
