import type { PlanarPerformance } from '@/graph/renderers/planar-performance';

const active = new WeakMap<object, PlanarPerformance>();
export function getG6TranslationDiagnostics(
	graph: object,
): PlanarPerformance | undefined {
	return active.get(graph);
}

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** Version-checked, instance-local observation of the synchronous G6 translate
 * pipeline. Promises, arguments, return values and exceptions pass through.
 * Nested timings are inclusive and must not be added together. */
export function observeG6Translation(
	graph: object,
	session: PlanarPerformance,
): () => void {
	const cleanups: Array<() => void> = [];
	const wrap = (
		target: unknown,
		key: string,
		metric: string,
		outer = false,
	) => {
		if (!target || typeof target !== 'object') return false;
		const object = target as Record<string, unknown>;
		const original = object[key];
		if (typeof original !== 'function') return false;
		const hadOwn = Object.prototype.hasOwnProperty.call(object, key);
		const method = original as Method;
		const wrapped: Method = function (...args) {
			if (!outer && active.get(graph) !== session)
				return method.apply(this, args);
			const previous = active.get(graph);
			if (outer) active.set(graph, session);
			const started = performance.now();
			try {
				return method.apply(this, args);
			} finally {
				session.record(metric, performance.now() - started);
				if (outer) {
					if (previous) active.set(graph, previous);
					else active.delete(graph);
				}
			}
		};
		object[key] = wrapped;
		cleanups.push(() => {
			if (object[key] !== wrapped) return;
			if (hadOwn) object[key] = original;
			else delete object[key];
		});
		return true;
	};
	const context = (
		graph as {
			context?: {
				model?: unknown;
				element?: unknown;
				animation?: unknown;
			};
		}
	).context;
	if (!wrap(graph, 'translateElementTo', 'g6TranslateTotal', true)) {
		session.record('g6DetailUnavailable');
		return () => {};
	}
	for (const [target, key, metric] of [
		[context?.model, 'translateNodeLikeTo', 'g6ModelPosition'],
		[context?.element, 'computeChangesAndDrawData', 'g6PrepareChanges'],
		[context?.element, 'updateElement', 'g6ScheduleElement'],
		[context?.animation, 'animate', 'g6ExecuteTasks'],
	] as const) {
		if (!wrap(target, key, metric)) session.record(`${metric}Unavailable`);
	}
	return () => {
		cleanups.reverse().forEach((cleanup) => cleanup());
		active.delete(graph);
	};
}
