import { describe, expect, it, vi } from 'vitest';
import type { PlanarPerformance } from '@/graph/renderers/planar-performance';
import {
	observeG6Translation,
	getG6TranslationDiagnostics,
} from '@/graph/renderers/g6/g6-translation-diagnostics';
import { installG6PositionOnlyUpdate } from '@/graph/renderers/g6/g6-position-transform';

describe('G6 translation diagnostics', () => {
	it('times only translation, preserves arguments/promise and restores methods', () => {
		const record = vi.fn();
		const session = { record } as unknown as PlanarPerformance;
		const promise = Promise.resolve();
		const model = { translateNodeLikeTo: vi.fn() };
		const context = {
			model,
			element: {
				computeChangesAndDrawData: vi.fn(),
				updateElement: vi.fn(),
			},
			animation: { animate: vi.fn() },
		};
		const graph = {
			context,
			translateElementTo(id: string, point: number[]) {
				expect(getG6TranslationDiagnostics(this)).toBe(session);
				this.context.model.translateNodeLikeTo(id, point);
				this.context.element.computeChangesAndDrawData();
				this.context.element.updateElement();
				this.context.animation.animate();
				return promise;
			},
		};
		const original = model.translateNodeLikeTo;
		const stop = observeG6Translation(graph, session);
		model.translateNodeLikeTo();
		expect(record).not.toHaveBeenCalled();
		const point = [1, 2];
		expect(graph.translateElementTo('n', point)).toBe(promise);
		expect(original).toHaveBeenLastCalledWith('n', point);
		expect(record.mock.calls.map((call) => String(call[0]))).toEqual([
			'g6ModelPosition',
			'g6PrepareChanges',
			'g6ScheduleElement',
			'g6ExecuteTasks',
			'g6TranslateTotal',
		]);
		expect(getG6TranslationDiagnostics(graph)).toBeUndefined();
		stop();
		expect(model.translateNodeLikeTo).toBe(original);
	});
	it('preserves errors and inherited methods and clears the active scope', () => {
		const error = new Error('test');
		class Graph {
			translateElementTo() {
				throw error;
			}
		}
		const graph = new Graph();
		const record = vi.fn();
		const stop = observeG6Translation(graph, {
			record,
		} as unknown as PlanarPerformance);
		expect(() => graph.translateElementTo()).toThrow(error);
		expect(getG6TranslationDiagnostics(graph)).toBeUndefined();
		expect(record).toHaveBeenCalledWith('g6ModelPositionUnavailable');
		stop();
		expect(
			Object.prototype.hasOwnProperty.call(graph, 'translateElementTo'),
		).toBe(false);
	});
	it('records actual node hits and fallback without changing rendering', () => {
		const record = vi.fn();
		const session = { record } as unknown as PlanarPerformance;
		const render = vi.fn();
		const node = {
			render,
			update: (_attrs?: object) => {
				node.render();
			},
		};
		const restore = installG6PositionOnlyUpdate(node, () => session);
		node.update({ x: 1, y: 2 });
		expect(render).not.toHaveBeenCalled();
		expect(record).toHaveBeenCalledWith('nodeFastHit');
		node.update({ fill: 'red' });
		expect(render).toHaveBeenCalledOnce();
		expect(record).toHaveBeenCalledWith('nodeFastFallbackAttributes');
		restore();
	});
});
