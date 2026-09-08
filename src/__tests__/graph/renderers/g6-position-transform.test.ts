/* eslint-disable @typescript-eslint/unbound-method -- Compare method identity for hook restoration; never invoke detached methods. */
import {
	Circle,
	Rect,
	Diamond,
	Triangle,
	Hexagon,
	Star,
	type RuntimeContext,
} from '@antv/g6';
import { describe, expect, it, vi } from 'vitest';
import {
	G6PositionTransform,
	installG6PositionOnlyUpdate,
} from '@/graph/renderers/g6/g6-position-transform';

describe('G6 position-only native node updates', () => {
	it('removes 3000 child-shape renders from a 150-node motion sequence', () => {
		const nodes = Array.from(
			{ length: 150 },
			(_, i) =>
				new Circle({
					style: {
						x: i,
						y: 0,
						size: 20,
						labelText: `Note ${i}`,
						label: true,
						labelBackground: false,
						ports: [],
					},
				}),
		);
		const renders = nodes.map((node) => vi.spyOn(node, 'render'));
		const move = () => {
			for (let tick = 1; tick <= 20; tick++) {
				for (const node of nodes)
					node.update({ x: tick, y: tick * 2, z: 0 });
			}
		};
		move();
		expect(
			renders.reduce((sum, render) => sum + render.mock.calls.length, 0),
		).toBe(3000);
		renders.forEach((render) => render.mockClear());
		const restores = nodes.map(installG6PositionOnlyUpdate);
		try {
			move();
			expect(
				renders.every((render) => render.mock.calls.length === 0),
			).toBe(true);
		} finally {
			restores.forEach((restore) => restore());
			nodes.forEach((node) => node.destroy());
		}
	});

	it('leaves custom position-dependent nodes untouched', () => {
		class CustomCircle extends Circle {}
		const node = new CustomCircle({ style: { size: 20, label: false } });
		const originalUpdate = node.update;
		const transform = new G6PositionTransform(
			{
				element: { getElement: () => node },
			} as unknown as RuntimeContext,
			{ type: 'test' },
		);
		const empty = () => ({
			nodes: new Map(),
			edges: new Map(),
			combos: new Map(),
		});
		const data = { add: empty(), update: empty(), remove: empty() };
		data.update.nodes.set('n', { id: 'n' });
		transform.beforeDraw(data, { stage: 'translate', animation: false });
		expect(node.update).toBe(originalUpdate);
		transform.destroy();
		node.destroy();
	});

	it('restores per-node hooks on removal and transform teardown', () => {
		const node = new Circle({ style: { size: 20, label: false } });
		const originalUpdate = node.update;
		const transform = new G6PositionTransform(
			{
				element: { getElement: () => node },
			} as unknown as RuntimeContext,
			{ type: 'test' },
		);
		const empty = () => ({
			nodes: new Map(),
			edges: new Map(),
			combos: new Map(),
		});
		const data = { add: empty(), update: empty(), remove: empty() };
		data.update.nodes.set('n', { id: 'n' });
		transform.beforeDraw(data, { stage: 'translate', animation: false });
		expect(node.update).not.toBe(originalUpdate);
		data.update.nodes.clear();
		data.remove.nodes.set('n', { id: 'n' });
		transform.beforeDraw(data, { stage: 'update', animation: false });
		expect(node.update).toBe(originalUpdate);
		data.remove.nodes.clear();
		data.update.nodes.set('n', { id: 'n' });
		transform.beforeDraw(data, { stage: 'translate', animation: false });
		transform.destroy();
		expect(node.update).toBe(originalUpdate);
		node.destroy();
	});
	it.each([Circle, Rect, Diamond, Triangle, Hexagon, Star])(
		'%s preserves children and transforms without rendering them again',
		(Node) => {
			const node = new Node({
				style: {
					x: 0,
					y: 0,
					size: 20,
					labelText: 'Note',
					label: true,
					labelBackground: false,
					ports: [],
				},
			});
			const render = vi.spyOn(node, 'render');
			const originalUpdate = node.update;
			const children = [...node.children];
			const restore = installG6PositionOnlyUpdate(node);
			try {
				for (let i = 1; i <= 100; i++)
					node.update({ x: i, y: i * 2, z: 0 });
				expect(render).not.toHaveBeenCalled();
				expect(node.attributes).toMatchObject({ x: 100, y: 200 });
				const position = node.getLocalPosition();
				expect([position[0], position[1]]).toEqual([100, 200]);
				expect([...node.children]).toEqual(children);
				node.update({ fill: 'red', size: 30 });
				expect(render).toHaveBeenCalledOnce();
				expect(node.attributes.fill).toBe('red');
				restore();
				expect(node.update).toBe(originalUpdate);
				node.update({ x: 110 });
				expect(render).toHaveBeenCalledTimes(2);
			} finally {
				restore();
				node.destroy();
			}
		},
	);
});
