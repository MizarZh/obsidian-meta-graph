import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaGraphDocument } from '../core/types';
import { WorkspaceAutoSave } from '../ui/workspace/autosave';
import { serializeMetaGraphState } from '../workspace/meta-graph-model';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('WorkspaceAutoSave', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not save when scheduled state matches initialized fingerprint', () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const onSave = vi.fn<(document: MetaGraphDocument) => Promise<void>>(
			() => Promise.resolve(),
		);
		const autoSave = new WorkspaceAutoSave(onSave, 350, timerHost());

		autoSave.initialize(state);
		autoSave.schedule(state);
		vi.runAllTimers();

		expect(onSave).not.toHaveBeenCalled();
	});

	it('debounces and saves the latest changed state', () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const onSave = vi.fn<(document: MetaGraphDocument) => Promise<void>>(
			() => Promise.resolve(),
		);
		const autoSave = new WorkspaceAutoSave(onSave, 350, timerHost());

		autoSave.initialize(state);
		autoSave.schedule({ ...state, activeConnectionField: 'related' });
		autoSave.schedule({ ...state, activeConnectionField: 'depends-on' });
		vi.advanceTimersByTime(349);
		expect(onSave).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith(
			serializeMetaGraphState({
				...state,
				activeConnectionField: 'depends-on',
			}),
		);
	});

	it('flushes pending autosave immediately', () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const onSave = vi.fn<(document: MetaGraphDocument) => Promise<void>>(
			() => Promise.resolve(),
		);
		const autoSave = new WorkspaceAutoSave(onSave, 350, timerHost());

		autoSave.initialize(state);
		autoSave.schedule({ ...state, activeConnectionField: 'related' });
		autoSave.flush();
		vi.runAllTimers();

		expect(onSave).toHaveBeenCalledTimes(1);
	});
});

function timerHost(): ConstructorParameters<typeof WorkspaceAutoSave>[2] {
	return {
		setTimeout,
		clearTimeout,
	};
}
