import {
	Circle,
	Rect,
	Diamond,
	Triangle,
	Hexagon,
	Star,
	Line,
	Quadratic,
	GraphEvent,
	type ElementDatum,
	type ElementType,
} from '@antv/g6';
import { ElementLifeCycleEvent } from '@antv/g6/esm/utils/event/events';
import { getG6TranslationDiagnostics } from '@/graph/renderers/g6/g6-translation-diagnostics';

type Style = Record<string, unknown>;
interface Element {
	constructor: unknown;
	destroyed?: boolean;
	update(style: Style): void;
	onUpdate?(): void;
}
interface DrawContext {
	stage?: string;
	animation?: unknown;
	silence?: boolean;
}
interface Data {
	nodes: Map<string, ElementDatum>;
	edges: Map<string, ElementDatum>;
	combos: Map<string, ElementDatum>;
}
interface Callbacks {
	before?(): void;
	after?(): void;
}
interface Controller {
	updateElements(data: Data, context: DrawContext): void;
	getElement(id: string): Element | undefined;
	getElementType(type: ElementType, datum: ElementDatum): string;
	getUpdateStageStyle(
		type: ElementType,
		datum: ElementDatum,
		context: DrawContext,
	): Style;
	shapeTypeMap: Record<string, string>;
	emit(event: ElementLifeCycleEvent, context: DrawContext): void;
}
interface Animation {
	tasks: unknown[];
	add(context: object, callbacks: Callbacks): void;
}
interface Job {
	id: string;
	type: ElementType;
	datum: ElementDatum;
	style: Style;
}
const native = new Set<unknown>([
	Circle,
	Rect,
	Diamond,
	Triangle,
	Hexagon,
	Star,
	Line,
	Quadratic,
]);

/** G6 5.1 compatibility seam. A pure, non-animated native-node/edge batch
 * keeps G6's event order and element.update implementations, but does not
 * create per-element animation contexts, full style snapshots or closures.
 * Anything structural/custom/animated stays on G6's original pipeline. */
export function installG6TranslateBatch(graph: object): () => void {
	const target = graph as {
		context?: { element?: Controller; animation?: Animation };
		getEvents?(): Record<string, unknown[]>;
	};
	const runtime = target.context;
	const controller = runtime?.element;
	const animation = runtime?.animation;
	if (
		!controller ||
		!animation ||
		!Array.isArray(animation.tasks) ||
		!controller.shapeTypeMap ||
		![
			'updateElements',
			'getElement',
			'getElementType',
			'getUpdateStageStyle',
			'emit',
		].every(
			(key) =>
				typeof (controller as unknown as Record<string, unknown>)[
					key
				] === 'function',
		) ||
		typeof animation.add !== 'function' ||
		typeof target.getEvents !== 'function'
	)
		return () => {};

	// eslint-disable-next-line @typescript-eslint/unbound-method -- Called with its original receiver and restored by identity.
	const originalUpdate = controller.updateElements;
	const update: Controller['updateElements'] = function (
		this: Controller,
		data,
		context,
	) {
		const listeners = target.getEvents!();
		if (
			context.stage !== 'translate' ||
			context.animation !== false ||
			data.combos.size ||
			animation.tasks.length ||
			// Such listeners can mutate types/styles or enqueue interleaved tasks.
			(!context.silence &&
				(listeners[GraphEvent.BEFORE_ELEMENT_UPDATE]?.length ||
					listeners['*']?.length))
		)
			return originalUpdate.call(this, data, context);
		const jobs: Job[] = [];
		// Preflight the whole batch before emitting any events or changing anything.
		for (const [items, type] of [
			[data.nodes, 'node'],
			[data.edges, 'edge'],
		] as const) {
			for (const [id, datum] of items) {
				const element = this.getElement(id);
				if (
					!element ||
					element.destroyed ||
					!native.has(element.constructor) ||
					this.shapeTypeMap[id] !== this.getElementType(type, datum)
				)
					return originalUpdate.call(this, data, context);
				jobs.push({
					id,
					type,
					datum,
					style: this.getUpdateStageStyle(type, datum, context),
				});
			}
		}
		for (const job of jobs)
			this.emit(
				new ElementLifeCycleEvent(
					GraphEvent.BEFORE_ELEMENT_UPDATE,
					job.type,
					job.datum,
				),
				context,
			);
		if (!jobs.length) return;
		// Keep G6's queue ownership, BEFORE/AFTER_DRAW and reentrant task handling.
		// animation:false never reads style snapshots or invokes the executor.
		animation.add(
			{
				element: this.getElement(jobs[0]!.id),
				elementType: jobs[0]!.type,
				stage: 'translate',
				originalStyle: {},
				updatedStyle: {},
			},
			{
				before: () => {
					for (const job of jobs) {
						const element = controller.getElement(job.id);
						if (!element || element.destroyed) continue;
						element.update(job.style);
						controller.emit(
							new ElementLifeCycleEvent(
								GraphEvent.AFTER_ELEMENT_UPDATE,
								job.type,
								job.datum,
							),
							context,
						);
						element.onUpdate?.();
					}
				},
			},
		);
		getG6TranslationDiagnostics(graph)?.record('lightweightTranslateBatch');
	};
	controller.updateElements = update;
	return () => {
		if (controller.updateElements === update)
			controller.updateElements = originalUpdate;
	};
}
