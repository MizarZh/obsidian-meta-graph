import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceConnectionPort } from '../workspace/actions/connection-actions';
import { WorkspaceConnectionCoordinator } from '../workspace/controller/workspace-connection-coordinator';
import { WorkspaceStore } from '../workspace/controller/workspace-store';
import type { WorkspaceConnectionService } from '../workspace/services/connection-service';
import { addConnectionFieldAndSelectInState } from '../workspace/state/connection-fields';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace controller collaborators', () => {
	it('owns subscriptions and identity checks in the workspace store', () => {
		const initialState = createWorkspaceState(100);
		const store = new WorkspaceStore(initialState);
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);

		expect(listener).toHaveBeenCalledOnce();
		expect(store.replace(initialState)).toBe(false);
		expect(listener).toHaveBeenCalledOnce();

		const nextState = { ...initialState, labelSize: 15 };
		expect(store.replace(nextState)).toBe(true);
		expect(listener).toHaveBeenLastCalledWith(nextState);

		unsubscribe();
		store.replace({ ...nextState, labelSize: 16 });
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it('coordinates connection state, persistence, and refresh policy', async () => {
		const initialState = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'leads-to',
			'directed',
		).state;
		const store = new WorkspaceStore({
			...initialState,
			mode: 'flow',
		});
		const connectNodes = vi.fn(async () => true);
		const service: WorkspaceConnectionPort = {
			undoCount: 1,
			redoCount: 0,
			connectNodes,
			undoLastConnection: async () => false,
			redoLastConnection: async () => false,
		};
		const scheduleRefresh = vi.fn();
		const coordinator = new WorkspaceConnectionCoordinator(
			{
				store,
				service: service as WorkspaceConnectionService<never>,
				readOnly: false,
				commit: (state) => store.replace(state),
				scheduleRefresh,
			},
			true,
		);

		await coordinator.connectNodes('Source.md', 'Target.md', 'leads-to');

		expect(connectNodes).toHaveBeenCalledWith(
			'Source.md',
			'Target.md',
			'leads-to',
			'directed',
		);
		expect(store.snapshot.connectionUndoCount).toBe(1);
		expect(scheduleRefresh).toHaveBeenCalledWith(true);
	});
});
