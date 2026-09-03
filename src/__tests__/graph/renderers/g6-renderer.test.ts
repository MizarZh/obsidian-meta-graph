import Graphology from 'graphology';
import { describe, expect, it, vi } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../../graph/model/graphology-adapter';
import {
	G6Renderer,
	type G6GraphInstance,
} from '../../../graph/renderers/g6/g6-renderer';
import type { G6GraphData } from '../../../graph/renderers/g6/g6-data';
import type { G6RendererOptions } from '../../../graph/renderers/renderer-options';

describe('G6 renderer', () => {
	it('draws existing coordinates without invoking a G6 layout', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		let graphOptions: Parameters<NonNullable<Parameters<typeof G6Renderer.create>[1]>>[0] | undefined;

		const renderer = await G6Renderer.create(createOptions(graph), (options) => {
			graphOptions = options;
			return fake.instance;
		});

		expect(renderer).toBeDefined();
		expect(fake.draw).toHaveBeenCalledOnce();
		expect(graphOptions).toMatchObject({
			animation: false,
			zoomRange: [0.25, 4],
			behaviors: ['drag-canvas', 'zoom-canvas'],
		});
		expect(graphOptions).not.toHaveProperty('layout');
		expect(graphOptions?.data?.nodes?.[0]).toMatchObject({
			id: 'A.md',
			style: { x: 10, y: 20 },
		});
	});

	it('supports zoom, fit, focus, coordinates, and zoom listeners', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		const zoomListener = vi.fn();
		renderer.onZoomLevelChange(zoomListener);
		renderer.zoomBy(1.1);
		renderer.setZoomLevel(900);
		renderer.fit();
		renderer.focusNode('A.md');

		expect(fake.zoomBy).toHaveBeenCalledWith(1.1, { duration: 180 });
		expect(fake.zoomTo).toHaveBeenCalledWith(4, false);
		expect(fake.fitView).toHaveBeenCalledWith(
			{ when: 'always', direction: 'both' },
			{ duration: 350 },
		);
		expect(fake.focusElement).toHaveBeenCalledWith('A.md', {
			duration: 350,
		});
		expect(renderer.viewportToGraphPosition({ x: 2, y: 3 })).toEqual({
			x: 12,
			y: 23,
		});
		expect(renderer.graphToViewportPosition({ x: 12, y: 23 })).toEqual({
			x: 2,
			y: 3,
		});

		fake.emitTransform();
		expect(zoomListener).toHaveBeenCalledWith(400);
	});

	it('updates data with draw and destroys stale initial renders', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const options = createOptions(graph);
		const renderer = await G6Renderer.create(options, () => fake.instance);
		if (!renderer) throw new Error('Expected renderer');

		graph.setNodeAttribute('A.md', 'x', 50);
		renderer.setGraph(graph);
		await vi.waitFor(() => expect(fake.draw).toHaveBeenCalledTimes(2));
		const updatedData = fake.setData.mock.calls[0]?.[0];
		expect(updatedData?.nodes[0]?.style).toMatchObject({ x: 50 });

		let stale = false;
		const staleFake = createFakeG6(() => {
			stale = true;
		});
		const staleRenderer = await G6Renderer.create(
			{ ...options, isStale: () => stale },
			() => staleFake.instance,
		);
		expect(staleRenderer).toBeUndefined();
		expect(staleFake.destroy).toHaveBeenCalledOnce();
	});
});

function createRuntimeGraph(): RuntimeGraph {
	const graph = new Graphology<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
	graph.addNode('A.md', {
		label: 'A',
		x: 10,
		y: 20,
		size: 8,
		color: '#123456',
		path: 'A.md',
		folder: '',
		domains: [],
		tags: [],
	});
	return graph;
}

function createOptions(graph: RuntimeGraph): G6RendererOptions {
	return {
		graph,
		container: {} as HTMLElement,
		palette: {
			node: '#111111',
			selected: '#222222',
			edge: '#333333',
			mutedNode: '#444444',
			mutedEdge: '#555555',
			label: '#666666',
			labelBackground: '#777777',
			background: '#888888',
		},
		fadeDistance: 1,
		labelSize: 12,
		labelBold: false,
		labelItalic: false,
		labelPosition: 'right',
		labelOffset: 4,
		labelLightTextColor: '#000000',
		labelLightBackgroundColor: '#ffffff',
		labelLightBackgroundOpacity: 0.8,
		labelDarkTextColor: '#ffffff',
		labelDarkBackgroundColor: '#000000',
		labelDarkBackgroundOpacity: 0.8,
		labelDensity: 1,
		forceLabels: false,
		threeLabelResolution: 'standard',
		scaleLabelsWithZoom: false,
		isStale: () => false,
	};
}

function createFakeG6(afterDraw?: () => void) {
	let zoom = 1;
	let transformListener: (() => void) | undefined;
	const draw = vi.fn(async () => {
		afterDraw?.();
	});
	const destroy = vi.fn();
	const setData = vi.fn<(data: G6GraphData) => void>();
	const updateData = vi.fn();
	const fitView = vi.fn(async () => undefined);
	const focusElement = vi.fn(async () => undefined);
	const zoomBy = vi.fn(async (factor: number) => {
		zoom *= factor;
	});
	const zoomTo = vi.fn(async (value: number) => {
		zoom = value;
	});
	const instance = {
		destroy,
		draw,
		fitView,
		focusElement,
		getCanvasByViewport: ([x, y]: [number, number]) => [x + 10, y + 20],
		getViewportByCanvas: ([x, y]: [number, number]) => [x - 10, y - 20],
		getZoom: () => zoom,
		off: vi.fn(),
		on: vi.fn((_event: string, listener: () => void) => {
			transformListener = listener;
		}),
		resize: vi.fn(),
		setData,
		setOptions: vi.fn(),
		updateData,
		zoomBy,
		zoomTo,
	} as unknown as G6GraphInstance;
	return {
		instance,
		destroy,
		draw,
		fitView,
		focusElement,
		setData,
		updateData,
		zoomBy,
		zoomTo,
		emitTransform: () => transformListener?.(),
	};
}
