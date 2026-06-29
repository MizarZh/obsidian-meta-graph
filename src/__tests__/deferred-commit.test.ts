import { describe, expect, it, vi } from 'vitest';
import {
	DeferredCommitScheduler,
	ThrottledCommitScheduler,
} from '../ui/filter/deferred-commit';

describe('commit schedulers', () => {
	it('defers commits until the delay elapses', () => {
		const commit = vi.fn();
		const timers = createTimerHost();
		const scheduler = new DeferredCommitScheduler(timers.host, 180);

		scheduler.schedule('color', '#000000', '#111111', commit);
		expect(commit).not.toHaveBeenCalled();

		timers.runNext();
		expect(commit).toHaveBeenCalledWith('#111111');
	});

	it('throttles commits while preserving immediate first and final values', () => {
		const commit = vi.fn();
		const timers = createTimerHost();
		const scheduler = new ThrottledCommitScheduler(timers.host, 120);

		scheduler.schedule('color', '#000000', '#111111', commit);
		scheduler.schedule('color', '#111111', '#222222', commit);
		scheduler.schedule('color', '#111111', '#333333', commit);
		expect(commit).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenLastCalledWith('#111111');

		timers.runNext();
		expect(commit).toHaveBeenCalledTimes(2);
		expect(commit).toHaveBeenLastCalledWith('#333333');

		scheduler.commit('color', '#333333', '#444444', commit);
		expect(commit).toHaveBeenCalledTimes(3);
		expect(commit).toHaveBeenLastCalledWith('#444444');
	});
});

function createTimerHost(): {
	host: Window;
	runNext(): void;
} {
	let nextId = 1;
	const callbacks = new Map<number, () => void>();
	return {
		host: {
			setTimeout: (handler: () => void) => {
				const id = nextId;
				nextId += 1;
				callbacks.set(id, handler);
				return id;
			},
			clearTimeout: (id?: number) => {
				if (id !== undefined) {
					callbacks.delete(id);
				}
			},
		} as unknown as Window,
		runNext: () => {
			const [id, callback] = callbacks.entries().next().value ?? [];
			if (id !== undefined && callback) {
				callbacks.delete(id);
				callback();
			}
		},
	};
}
