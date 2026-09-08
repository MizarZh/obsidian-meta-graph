import { describe, expect, it, vi } from 'vitest';
import type { BaseTransform, ElementDatum, RuntimeContext } from '@antv/g6';
import { DataController } from '@antv/g6/lib/runtime/data';
import { ElementController } from '@antv/g6/lib/runtime/element';
import { UpdateRelatedEdge } from '@antv/g6/lib/transforms/update-related-edge';
import {
	G6StateTransform,
	G6_STATE_TRANSFORM,
} from '@/graph/renderers/g6/g6-state-transform';

type Internals = {
	getDrawData(context: { stage: string; animation: boolean }): {
		data: { drawData: Parameters<BaseTransform['beforeDraw']>[0] };
	};
	computeStyle: (stage: string) => void;
	computeElementDefaultStyle(
		type: string,
		context: { datum: ElementDatum },
	): void;
};

function harness(count: number, optimized: boolean) {
	const model = new DataController();
	model.addData({
		nodes: Array.from({ length: count }, (_, i) => ({
			id: `n${i}`,
			style: { x: i, y: 0, size: 10, fill: 'blue' },
			states: [],
		})),
		edges: Array.from({ length: count - 1 }, (_, i) => ({
			id: `e${i}`,
			source: 'n0',
			target: `n${i + 1}`,
			style: { lineWidth: 1 },
			states: [],
		})),
	});
	model.clearChanges();
	const context = {
		model,
		graph: {},
		options: {
			node: {
				state: { dimmed: { fill: 'gray' }, hovered: { size: 14 } },
			},
		},
	} as unknown as RuntimeContext;
	const element = new ElementController(context);
	context.element = element;
	vi.spyOn(element, 'init').mockImplementation(() => {});
	const originalNodes = new Map(
		model
			.getNodeData()
			.map((node) => [
				node.id,
				{ z: 0, transform: [], ports: [], ...node.style },
			]),
	);
	vi.spyOn(element, 'getElement').mockImplementation(
		(id) =>
			({
				attributes: originalNodes.get(id) ?? { lineWidth: 1 },
			}) as never,
	);
	const related = new UpdateRelatedEdge(context, {
		type: 'update-related-edges',
	});
	const transform = new G6StateTransform(context, {
		type: G6_STATE_TRANSFORM,
	});
	context.transform = {
		getTransformInstance: () =>
			optimized ? { related, transform } : { related },
	} as unknown as RuntimeContext['transform'];
	const internals = element as unknown as Internals;
	const computed = vi.spyOn(internals, 'computeElementDefaultStyle');
	const scan = vi.spyOn(model, 'getElementsDataByType');
	return {
		model,
		element,
		internals,
		computed,
		scan,
		transform,
		draw: (stage = 'state') =>
			internals.getDrawData({ stage, animation: false }).data.drawData,
	};
}

describe('G6 state transform against installed runtime', () => {
	it('reproduces the upstream all-element style scan for one state change', () => {
		const h = harness(1000, false);
		h.model.updateData({ nodes: [{ id: 'n1', states: ['dimmed'] }] });
		h.draw();
		expect(h.computed).toHaveBeenCalledTimes(1999);
		expect(h.scan).toHaveBeenCalled();
	});

	it.each([100, 1000])(
		'bounds style work and removes color-only related edges in a %s-node graph',
		(count) => {
			const h = harness(count, true);
			h.model.updateData({ nodes: [{ id: 'n0', states: ['dimmed'] }] });
			const data = h.draw();
			expect(data.update.edges.size).toBe(0);
			expect(h.computed.mock.calls.length).toBeLessThanOrEqual(2);
			expect(h.scan).not.toHaveBeenCalled();
			h.transform.destroy();
		},
	);

	it('keeps explicit edge updates and size-dependent endpoint updates', () => {
		const h = harness(100, true);
		h.model.updateData({
			nodes: [{ id: 'n1', states: ['hovered'] }],
			edges: [{ id: 'e5', states: ['selected'] }],
		});
		expect([...h.draw().update.edges.keys()].sort()).toEqual(['e0', 'e5']);
		expect(h.scan).not.toHaveBeenCalled();
		h.transform.destroy();
	});

	it('retains full processing for normal draws and restores the original hook', () => {
		const h = harness(100, true);
		const original = h.internals.computeStyle;
		h.model.updateData({ nodes: [{ id: 'n1', states: ['dimmed'] }] });
		h.draw();
		h.model.updateData({ nodes: [{ id: 'n1', style: { x: 999 } }] });
		expect(h.draw('update').update.edges.has('e0')).toBe(true);
		expect(h.scan).toHaveBeenCalled();
		h.transform.destroy();
		expect(h.internals.computeStyle).toBe(original);
	});
});
