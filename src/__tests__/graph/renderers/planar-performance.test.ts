import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PlanarPerformance,
	getPlanarPerformance,
	observeGCanvas,
	setPlanarPerformanceLogging,
} from '@/graph/renderers/planar-performance';

afterEach(() => {
	setPlanarPerformanceLogging(false);
	vi.restoreAllMocks();
});

function harness() {
	const detach = vi.fn();
	const attach = vi.fn(() => detach);
	const snapshot = vi.fn(() => ({ nodes: 150 }));
	const host = {
		setInterval: vi.fn(() => 1),
		clearInterval: vi.fn(),
		devicePixelRatio: 2,
	};
	const owner = {};
	const session = new PlanarPerformance({
		owner,
		engine: 'g6',
		container: {
			ownerDocument: { defaultView: host },
			getBoundingClientRect: () => ({ width: 800, height: 600 }),
		} as unknown as HTMLElement,
		attach,
		snapshot,
	});
	return { session, host, owner, attach, detach, snapshot };
}

describe('planar performance diagnostics', () => {
	it('does no logging, timers or attachment while disabled; toggles existing sessions live', () => {
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		const h = harness();
		try {
			h.session.record('test', 100);
			h.session.flush();
			expect(getPlanarPerformance(h.owner)).toBeUndefined();
			expect(h.attach).not.toHaveBeenCalled();
			expect(h.host.setInterval).not.toHaveBeenCalled();
			expect(log).not.toHaveBeenCalled();
			expect(h.snapshot).not.toHaveBeenCalled();
			setPlanarPerformanceLogging(true);
			setPlanarPerformanceLogging(true);
			expect(h.attach).toHaveBeenCalledOnce();
			expect(getPlanarPerformance(h.owner)).toBe(h.session);
			h.session.record('translateSync', 10);
			h.session.record('translateSync', 30);
			h.session.flush();
			const report = JSON.parse(log.mock.calls[0]![1] as string) as {
				metrics: Record<
					string,
					{ count: number; meanMs: number; p95Ms: number }
				>;
			};
			expect(report.metrics.translateSync).toMatchObject({
				count: 2,
				meanMs: 20,
				p95Ms: 30,
			});
			h.session.flush();
			expect(log).toHaveBeenCalledOnce();
			setPlanarPerformanceLogging(false);
			expect(h.detach).toHaveBeenCalledOnce();
			expect(h.host.clearInterval).toHaveBeenCalledWith(1);
			h.session.record('test');
			h.session.flush();
			expect(log).toHaveBeenCalledOnce();
		} finally {
			h.session.destroy();
		}
	});
	it('counts only real Canvas rerenders and removes observers', () => {
		const h = harness();
		const canvas = new EventTarget();
		setPlanarPerformanceLogging(true);
		const record = vi.spyOn(h.session, 'record');
		const detach = observeGCanvas(canvas, 'main', h.session);
		const frame = (dirty: boolean) => {
			canvas.dispatchEvent(new Event('beforerender'));
			if (dirty) canvas.dispatchEvent(new Event('rerender'));
			canvas.dispatchEvent(new Event('afterrender'));
		};
		try {
			frame(false);
			expect(record).not.toHaveBeenCalled();
			frame(true);
			expect(record).toHaveBeenCalledWith('mainPaint');
			detach();
			record.mockClear();
			frame(true);
			expect(record).not.toHaveBeenCalled();
		} finally {
			setPlanarPerformanceLogging(false);
			h.session.destroy();
		}
	});
	it('unregisters destroyed sessions and drops old measurements when toggled', () => {
		const h = harness();
		setPlanarPerformanceLogging(true);
		h.session.record('old', 99);
		setPlanarPerformanceLogging(false);
		setPlanarPerformanceLogging(true);
		const log = vi.spyOn(console, 'info').mockImplementation(() => {});
		h.session.flush();
		expect(log).not.toHaveBeenCalled();
		h.session.destroy();
		expect(getPlanarPerformance(h.owner)).toBeUndefined();
		setPlanarPerformanceLogging(false);
		setPlanarPerformanceLogging(true);
		expect(h.attach).toHaveBeenCalledTimes(2);
	});
});
