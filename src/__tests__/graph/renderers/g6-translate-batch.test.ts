import { Circle, Line, GraphEvent } from '@antv/g6';
import { describe, expect, it, vi } from 'vitest';
import { installG6TranslateBatch } from '@/graph/renderers/g6/g6-translate-batch';

function fixture() {
	const events: string[] = [];
	const node = {
		constructor: Circle,
		update: vi.fn(() => events.push('node')),
		onUpdate: vi.fn(() => events.push('node-hook')),
	};
	const edge = {
		constructor: Line,
		update: vi.fn(() => events.push('edge')),
		onUpdate: vi.fn(() => events.push('edge-hook')),
	};
	const elements = new Map<string, typeof node | typeof edge>([
		['n', node],
		['e', edge],
	]);
	const tasks: Array<{ before?(): void; after?(): void }> = [];
	const animation = {
		tasks,
		add: vi.fn(
			(
				_context: object,
				callbacks: { before?(): void; after?(): void },
			) => tasks.push(callbacks),
		),
	};
	const fallback = vi.fn((_data: object, _context: object): void => {});
	const controller = {
		updateElements: fallback,
		getElement: (id: string) => elements.get(id),
		getElementType: (type: string) => (type === 'node' ? 'circle' : 'line'),
		getUpdateStageStyle: (type: string) =>
			type === 'node' ? { x: 1, y: 2, z: 0 } : {},
		shapeTypeMap: { n: 'circle', e: 'line' },
		emit: (
			event: { type: string; elementType: string },
			context: { silence?: boolean },
		) => {
			if (!context.silence)
				events.push(`${event.type}:${event.elementType}`);
		},
	};
	const graph = {
		context: { element: controller, animation },
		getEvents: vi.fn((): Record<string, unknown[]> => ({})),
	};
	const data = {
		nodes: new Map([['n', { id: 'n' }]]),
		edges: new Map([['e', { id: 'e', source: 'n', target: 'n' }]]),
		combos: new Map(),
	};
	const restore = installG6TranslateBatch(graph);
	const run = (context = { stage: 'translate', animation: false }) =>
		controller.updateElements(data, context);
	return {
		events,
		node,
		edge,
		animation,
		tasks,
		controller,
		graph,
		data,
		restore,
		run,
		fallback,
		elements,
	};
}

describe('G6 lightweight translation batch', () => {
	it('queues one task without reading full attributes and preserves lifecycle order', () => {
		const f = fixture();
		Object.defineProperty(f.node, 'attributes', {
			get: () => {
				throw new Error('snapshot');
			},
		});
		f.run();
		expect(f.fallback).not.toHaveBeenCalled();
		expect(f.animation.add).toHaveBeenCalledOnce();
		expect(f.node.update).not.toHaveBeenCalled();
		f.events.push('before-draw');
		f.tasks[0]!.before!();
		f.events.push('after-draw');
		expect(f.events).toEqual([
			`${GraphEvent.BEFORE_ELEMENT_UPDATE}:node`,
			`${GraphEvent.BEFORE_ELEMENT_UPDATE}:edge`,
			'before-draw',
			'node',
			`${GraphEvent.AFTER_ELEMENT_UPDATE}:node`,
			'node-hook',
			'edge',
			`${GraphEvent.AFTER_ELEMENT_UPDATE}:edge`,
			'edge-hook',
			'after-draw',
		]);
		expect(f.node.update).toHaveBeenCalledWith({ x: 1, y: 2, z: 0 });
		expect(f.edge.update).toHaveBeenCalledWith({});
	});
	it.each([
		'animated',
		'style',
		'combo',
		'custom',
		'missing',
		'type-change',
		'queued',
		'listener',
	])('falls back for %s', (kind) => {
		const f = fixture();
		if (kind === 'combo') f.data.combos.set('c', { id: 'c' });
		if (kind === 'custom')
			f.node.constructor = class Custom {} as unknown as typeof Circle;
		if (kind === 'missing') f.elements.delete('n');
		if (kind === 'type-change') f.controller.shapeTypeMap.n = 'rect';
		if (kind === 'queued') f.tasks.push({});
		if (kind === 'listener')
			f.graph.getEvents.mockReturnValue({
				[GraphEvent.BEFORE_ELEMENT_UPDATE]: [{}],
			});
		f.run({
			stage: kind === 'style' ? 'update' : 'translate',
			animation: kind === 'animated',
		});
		expect(f.fallback).toHaveBeenCalledOnce();
		expect(f.animation.add).not.toHaveBeenCalled();
		expect(f.events).toEqual([]);
	});
	it('silences events, reads latest elements and restores original method', () => {
		const f = fixture();
		f.controller.updateElements(f.data, {
			stage: 'translate',
			animation: false,
			silence: true,
		});
		f.elements.delete('n');
		f.tasks[0]!.before!();
		expect(f.node.update).not.toHaveBeenCalled();
		expect(f.edge.update).toHaveBeenCalledOnce();
		expect(f.events).toEqual(['edge', 'edge-hook']);
		f.restore();
		expect(f.controller.updateElements).toBe(f.fallback);
	});
	it('ignores incompatible G6 internals', () => {
		expect(() => installG6TranslateBatch({})()).not.toThrow();
	});
});
