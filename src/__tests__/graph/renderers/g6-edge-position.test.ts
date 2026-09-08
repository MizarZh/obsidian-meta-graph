import {
	Circle,
	Line,
	Quadratic,
	type RuntimeContext,
	type BaseEdge,
} from '@antv/g6';
import { describe, expect, it, vi } from 'vitest';
import { updateG6EdgePosition } from '@/graph/renderers/g6/g6-edge-position';
import { G6PositionTransform } from '@/graph/renderers/g6/g6-position-transform';

interface KeyShapeSnapshot {
	attributes: { d: unknown; stroke: unknown };
	parsedStyle: { markerEnd?: { getLocalPosition(): unknown } };
}

function keyShape(edge: BaseEdge): KeyShapeSnapshot {
	const shape: unknown = edge.getShape('key');
	return shape as KeyShapeSnapshot;
}

describe('G6 edge geometry-only updates', () => {
	it.each([
		['fits', 200, 'relation', false],
		['wraps', 40, 'relation', true],
		['truncated', 200, 'rela…', true],
	] as const)(
		'reuses label layout only when safe: %s',
		(_name, width, measured, rebuild) => {
			const next = {
				text: 'relation',
				wordWrap: true,
				wordWrapWidth: width,
				transform: [['translate', 40, 20]],
			};
			const label = {
				attributes: { ...next, wordWrapWidth: 100 },
				setAttribute: vi.fn(),
				update: vi.fn(),
				getShape: () => ({
					getGeometryBounds: () => ({ halfExtents: [30, 10] }),
					parsedStyle: { metrics: { lines: [measured] } },
				}),
			};
			const key = { setAttribute: vi.fn() };
			const edge = {
				attributes: {
					sourceNode: 'a',
					targetNode: 'b',
					label: true,
					labelText: 'relation',
				},
				getShape: (name: string) =>
					name === 'key' ? key : name === 'label' ? label : undefined,
				getKeyPath: () => [
					['M', 0, 0],
					['L', 40, 20],
				],
				getLabelStyle: () => next,
			} as unknown as BaseEdge;
			expect(updateG6EdgePosition(edge)).toBe(true);
			expect(label.update).toHaveBeenCalledTimes(rebuild ? 1 : 0);
			expect(label.setAttribute).toHaveBeenCalledTimes(rebuild ? 0 : 1);
		},
	);

	it('arms edges only for translation and restores hooks on removal', () => {
		const a = new Circle({ style: { x: 0, y: 0, size: 20, label: false } });
		const b = new Circle({
			style: { x: 100, y: 0, size: 20, label: false },
		});
		const context = {
			element: {
				getElement: (id: string): unknown =>
					id === 'a' ? a : id === 'b' ? b : edge,
			},
		} as unknown as RuntimeContext;
		const options = {
			context,
			style: { sourceNode: 'a', targetNode: 'b', label: false },
		};
		const edge = new Line(options);
		const render = vi.spyOn(edge, 'render');
		const transform = new G6PositionTransform(context, { type: 'test' });
		const empty = () => ({
			nodes: new Map(),
			edges: new Map(),
			combos: new Map(),
		});
		const data = { add: empty(), update: empty(), remove: empty() };
		data.update.edges.set('e', { id: 'e', source: 'a', target: 'b' });
		try {
			transform.beforeDraw(data, {
				stage: 'translate',
				animation: false,
			});
			edge.update({});
			expect(render).not.toHaveBeenCalled();
			edge.update({ stroke: 'red' });
			expect(render).toHaveBeenCalledTimes(1);
			edge.update({});
			expect(render).toHaveBeenCalledTimes(2);
			data.update.edges.clear();
			data.remove.edges.set('e', { id: 'e', source: 'a', target: 'b' });
			transform.beforeDraw(data, { stage: 'update', animation: false });
			edge.update({});
			expect(render).toHaveBeenCalledTimes(3);
		} finally {
			transform.destroy();
			edge.destroy();
			a.destroy();
			b.destroy();
		}
	});
	it.each([Line, Quadratic])(
		'matches native path and arrow placement for %s',
		(Edge) => {
			const source = new Circle({
				style: { x: 0, y: 0, size: 20, label: false },
			});
			const target = new Circle({
				style: { x: 100, y: 0, size: 20, label: false },
			});
			const context = {
				element: {
					getElement: (id: string) => (id === 'a' ? source : target),
				},
			} as unknown as RuntimeContext;
			const style = {
				sourceNode: 'a',
				targetNode: 'b',
				label: false,
				endArrow: true,
				startArrow: true,
				stroke: 'blue',
				lineWidth: 2,
				curveOffset: 20,
			};
			const options = { context, style };
			const baseline = new Edge(options);
			const optimized = new Edge(options);
			const render = vi.spyOn(optimized, 'render');
			const key = keyShape(optimized);
			const arrow = key.parsedStyle.markerEnd;
			try {
				for (const [x, y] of [
					[200, 60],
					[-100, 140],
					[30, -70],
				]) {
					target.update({ x, y });
					baseline.update({});
					expect(updateG6EdgePosition(optimized)).toBe(true);
					expect(key.attributes.d).toEqual(
						keyShape(baseline).attributes.d,
					);
					expect(key.parsedStyle.markerEnd).toBe(arrow);
					expect(arrow?.getLocalPosition()).toEqual(
						keyShape(
							baseline,
						).parsedStyle.markerEnd?.getLocalPosition(),
					);
				}
				expect(render).not.toHaveBeenCalled();
				optimized.update({ stroke: 'red', lineWidth: 4 });
				expect(key.attributes.stroke).toBe('red');
				expect(render).toHaveBeenCalledOnce();
			} finally {
				baseline.destroy();
				optimized.destroy();
				source.destroy();
				target.destroy();
			}
		},
	);

	it('falls back for loops and badges', () => {
		const node = new Circle({ style: { size: 20, label: false } });
		const context = {
			element: { getElement: () => node },
		} as unknown as RuntimeContext;
		const options = {
			context,
			style: { sourceNode: 'a', targetNode: 'a', label: false },
		};
		const edge = new Line(options);
		try {
			expect(updateG6EdgePosition(edge)).toBe(false);
		} finally {
			edge.destroy();
			node.destroy();
		}
	});
});
