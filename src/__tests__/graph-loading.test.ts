import { describe, expect, it, vi } from 'vitest';
import { GraphLoadingCoordinator } from '../ui/workspace/graph-loading';

describe('GraphLoadingCoordinator', () => {
	it('keeps loading visible across transition and renderer work', async () => {
		const states: Array<{ visible: boolean; label?: string }> = [];
		const coordinator = new GraphLoadingCoordinator({
			waitForPaint: async () => undefined,
			onChange: (state) => states.push(state),
		});

		await coordinator.runTransition('Flow', () => {
			coordinator.setRendererPending(true);
		});

		expect(states).toEqual([
			{ visible: true, label: 'Flow' },
			{ visible: true, label: 'Flow' },
			{ visible: true, label: undefined },
		]);

		coordinator.setRendererPending(false);
		expect(states.at(-1)).toEqual({ visible: false, label: undefined });
	});

	it('ignores renderer work outside a chart transition', () => {
		const onChange = vi.fn();
		const coordinator = new GraphLoadingCoordinator({
			waitForPaint: async () => undefined,
			onChange,
		});

		coordinator.setRendererPending(true);
		coordinator.setRendererPending(false);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('runs only the latest queued transition', async () => {
		const paintResolvers: Array<() => void> = [];
		const firstAction = vi.fn();
		const secondAction = vi.fn();
		const coordinator = new GraphLoadingCoordinator({
			waitForPaint: () =>
				new Promise((resolve) => paintResolvers.push(resolve)),
			onChange: vi.fn(),
		});

		const first = coordinator.runTransition('Arc', firstAction);
		const second = coordinator.runTransition('Flow', secondAction);
		paintResolvers[0]?.();
		paintResolvers[1]?.();

		await expect(first).resolves.toBe(false);
		await expect(second).resolves.toBe(true);
		expect(firstAction).not.toHaveBeenCalled();
		expect(secondAction).toHaveBeenCalledOnce();
	});

	it('clears transition state after an error', async () => {
		const onChange = vi.fn();
		const coordinator = new GraphLoadingCoordinator({
			waitForPaint: async () => undefined,
			onChange,
		});

		await expect(
			coordinator.runTransition('3D graph', () => {
				throw new Error('Projection failed');
			}),
		).rejects.toThrow('Projection failed');
		expect(onChange).toHaveBeenLastCalledWith({
			visible: false,
			label: undefined,
		});
	});
});
