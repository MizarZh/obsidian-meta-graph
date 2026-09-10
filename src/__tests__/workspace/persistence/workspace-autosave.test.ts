import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetaGraphDocument } from '@/core/types';
import { WorkspaceAutoSave } from '@/ui/workspace/autosave';
import { serializeMetaGraphState } from '@/workspace/meta-graph-model';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

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

	it('defers document serialization until the debounce expires', () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const onSave = vi.fn<(document: MetaGraphDocument) => Promise<void>>(
			() => Promise.resolve(),
		);
		const serialize = vi.fn(serializeMetaGraphState);
		const autoSave = new WorkspaceAutoSave(
			onSave,
			350,
			timerHost(),
			serialize,
		);

		autoSave.initialize(state);
		autoSave.schedule({ ...state, activeConnectionField: 'related' });

		expect(serialize).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(350);
		expect(serialize).toHaveBeenCalledTimes(2);
		expect(onSave).toHaveBeenCalledOnce();
	});

	it('flushes pending autosave immediately', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const onSave = vi.fn<(document: MetaGraphDocument) => Promise<void>>(
			() => Promise.resolve(),
		);
		const autoSave = new WorkspaceAutoSave(onSave, 350, timerHost());

		autoSave.initialize(state);
		autoSave.schedule({ ...state, activeConnectionField: 'related' });
		await autoSave.flush();
		vi.runAllTimers();

		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it('retains failed content and retries the same document', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const next = { ...state, activeConnectionField: 'related' };
		const error = new Error('Disk unavailable');
		const onSave = vi
			.fn<(document: MetaGraphDocument) => Promise<void>>()
			.mockRejectedValueOnce(error)
			.mockResolvedValue(undefined);
		const saver = new WorkspaceAutoSave(onSave, 350, timerHost());
		saver.initialize(state);
		saver.schedule(next);
		await expect(saver.flush()).rejects.toBe(error);
		await saver.flush();
		expect(onSave).toHaveBeenCalledTimes(2);
		expect(onSave.mock.calls[0]).toEqual(onSave.mock.calls[1]);
		saver.schedule(next);
		await saver.flush();
		expect(onSave).toHaveBeenCalledTimes(2);
	});

	it('reports timer failures and retries when the same state is scheduled', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const next = { ...state, activeConnectionField: 'related' };
		const error = new Error('Disk unavailable');
		const onSave = vi
			.fn<(document: MetaGraphDocument) => Promise<void>>()
			.mockRejectedValueOnce(error)
			.mockResolvedValue(undefined);
		const onError = vi.fn();
		const saver = new WorkspaceAutoSave(
			onSave,
			350,
			timerHost(),
			serializeMetaGraphState,
			onError,
		);
		saver.initialize(state);
		saver.schedule(next);
		await vi.advanceTimersByTimeAsync(350);
		expect(onError).toHaveBeenCalledExactlyOnceWith(error);
		saver.schedule(next);
		await vi.advanceTimersByTimeAsync(350);
		expect(onSave).toHaveBeenCalledTimes(2);
	});

	it('serializes slow saves and flushes the latest queued edit', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		let complete!: () => void;
		const first = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const onSave = vi
			.fn<(document: MetaGraphDocument) => Promise<void>>()
			.mockReturnValueOnce(first)
			.mockResolvedValue(undefined);
		const saver = new WorkspaceAutoSave(onSave, 350, timerHost());
		saver.initialize(state);
		saver.schedule({ ...state, activeConnectionField: 'related' });
		const flush = saver.flush();
		saver.schedule({ ...state, activeConnectionField: 'intermediate' });
		saver.schedule(state);
		const concurrentFlush = saver.flush();
		expect(onSave).toHaveBeenCalledTimes(1);
		complete();
		await Promise.all([flush, concurrentFlush]);
		expect(onSave).toHaveBeenCalledTimes(2);
		expect(onSave).toHaveBeenLastCalledWith(serializeMetaGraphState(state));
	});

	it('keeps newer edits when an in-flight save fails', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		let fail!: (error: Error) => void;
		const first = new Promise<void>((_resolve, reject) => {
			fail = reject;
		});
		const onSave = vi
			.fn<(document: MetaGraphDocument) => Promise<void>>()
			.mockReturnValueOnce(first)
			.mockResolvedValue(undefined);
		const saver = new WorkspaceAutoSave(onSave, 350, timerHost());
		saver.initialize(state);
		saver.schedule({ ...state, activeConnectionField: 'related' });
		const flush = saver.flush();
		const latest = { ...state, activeConnectionField: 'latest' };
		saver.schedule(latest);
		fail(new Error('Disk unavailable'));
		await expect(flush).rejects.toThrow('Disk unavailable');
		await saver.flush();
		expect(onSave).toHaveBeenLastCalledWith(
			serializeMetaGraphState(latest),
		);
	});

	it('retains pending state after serialization or synchronous callback failure', async () => {
		vi.useFakeTimers();
		const state = createWorkspaceState(200);
		const serialize = vi.fn(serializeMetaGraphState);
		const onSave = vi
			.fn<(document: MetaGraphDocument) => Promise<void>>()
			.mockImplementationOnce(() => {
				throw new Error('Save failed');
			})
			.mockResolvedValue(undefined);
		const saver = new WorkspaceAutoSave(
			onSave,
			350,
			timerHost(),
			serialize,
		);
		saver.initialize(state);
		saver.schedule({ ...state, activeConnectionField: 'related' });
		serialize.mockImplementationOnce(() => {
			throw new Error('Serialization failed');
		});
		await expect(saver.flush()).rejects.toThrow('Serialization failed');
		await expect(saver.flush()).rejects.toThrow('Save failed');
		await saver.flush();
		expect(onSave).toHaveBeenCalledTimes(2);
	});
});

function timerHost(): ConstructorParameters<typeof WorkspaceAutoSave>[2] {
	return {
		setTimeout,
		clearTimeout,
	};
}
