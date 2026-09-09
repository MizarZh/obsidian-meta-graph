import { afterEach, describe, expect, it, vi } from 'vitest';
import { G6Renderer } from '@/graph/renderers/g6/g6-renderer';
import * as diagnostics from '@/graph/renderers/planar-performance';

afterEach(() => vi.restoreAllMocks());

describe('G6 force queue timing', () => {
	it.each([false, true])(
		'timer submissions reuse the queue without another rAF; killed: %s',
		async (killed) => {
			const frame = vi.fn();
			let release!: () => void;
			const renderer = {
				killed: false,
				isStale: () => false,
				forcePositionsDirty: false,
				syncForcePositions: vi.fn(),
				forceSyncScheduled: false,
				drawQueue: new Promise<void>((resolve) => {
					release = resolve;
				}),
				container: {
					ownerDocument: {
						defaultView: { requestAnimationFrame: frame },
					},
				},
				submitForcePositions: vi.fn(async () => {}),
			};
			const submit = () =>
				G6Renderer.prototype.syncForcePositions.call(
					renderer as unknown as G6Renderer,
					'simulation-tick',
				);
			submit();
			submit();
			submit();
			expect(frame).not.toHaveBeenCalled();
			expect(renderer.submitForcePositions).not.toHaveBeenCalled();
			renderer.killed = killed;
			release();
			await renderer.drawQueue;
			expect(renderer.submitForcePositions).toHaveBeenCalledTimes(
				killed ? 0 : 1,
			);
			// A real renderer's follow-up scheduler exits immediately when killed.
		},
	);
	it.each([false, true])(
		'separates frame and queue waits; disabled before submission: %s',
		async (disabled) => {
			let now = 10;
			vi.spyOn(performance, 'now').mockImplementation(() => now);
			const record = vi.fn();
			const session = {
				record,
			} as unknown as diagnostics.PlanarPerformance;
			const lookup = vi
				.spyOn(diagnostics, 'getPlanarPerformance')
				.mockReturnValue(session);
			let frame: (() => void) | undefined;
			let release!: () => void;
			const renderer = {
				killed: false,
				isStale: () => false,
				forcePositionsDirty: false,
				forceSyncScheduled: false,
				drawQueue: new Promise<void>((resolve) => {
					release = resolve;
				}),
				container: {
					ownerDocument: {
						defaultView: {
							requestAnimationFrame: (callback: () => void) => {
								frame = callback;
								return 1;
							},
						},
					},
				},
				submitForcePositions: vi.fn(async () => {}),
			};
			G6Renderer.prototype.syncForcePositions.call(
				renderer as unknown as G6Renderer,
			);
			now = 30;
			frame!();
			expect(record).toHaveBeenCalledWith('forceFrameWait', 20);
			expect(renderer.submitForcePositions).not.toHaveBeenCalled();
			if (disabled) lookup.mockReturnValue(undefined);
			now = 45;
			release();
			await renderer.drawQueue;
			expect(renderer.submitForcePositions).toHaveBeenCalledOnce();
			if (disabled) {
				expect(
					record.mock.calls.some(
						([metric]) => metric === 'forceDrawQueueWait',
					),
				).toBe(false);
			} else {
				expect(record).toHaveBeenCalledWith('forceDrawQueueWait', 15);
				expect(record).toHaveBeenCalledWith('forceQueueWait', 35);
			}
		},
	);
});
