import { describe, expect, it, vi } from 'vitest';
import type { ConnectionFieldMode, NodeId } from '../core/types';
import {
	completeConnectionChangeInState,
	connectPreparedNodesInState,
	prepareConnectDockNoteInState,
	prepareConnectNodesInState,
	undoLastConnectionInState,
	type WorkspaceConnectionPort,
} from '../workspace/actions/connection-actions';
import { setConnectionFieldModeInState } from '../workspace/state/connection-fields';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace connection actions', () => {
	it('prepares connection requests and updates the active field state', () => {
		const action = prepareConnectNodesInState(
			createWorkspaceState(100),
			'Source.md',
			'Target.md',
			' supports ',
		);

		expect(action?.request).toEqual({
			sourceNodeId: 'Source.md',
			targetNodeId: 'Target.md',
			field: 'supports',
		});
		expect(action?.mode).toBe('directed');
		expect(action?.runQuery).toBe(true);
		expect(action?.state.activeConnectionField).toBe('supports');
		expect(action?.state.query.relations).toContain('supports');
	});

	it('prepares dock connection direction and active field mode', () => {
		const state = setConnectionFieldModeInState(
			createWorkspaceState(100),
			'supports',
			'reverse',
		);

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
		const state = { ...createWorkspaceState(100), mode: 'flow' as const };
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
): WorkspaceConnectionPort & {
	connectNodesMock: ReturnType<typeof vi.fn>;
	undoLastConnectionMock: ReturnType<typeof vi.fn>;
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
	return {
		undoCount,
		connectNodes: connectNodesMock,
		undoLastConnection: undoLastConnectionMock,
		connectNodesMock,
		undoLastConnectionMock,
	};
}
