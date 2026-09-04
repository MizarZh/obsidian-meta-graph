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
import type { G6LabelControllerSnapshot } from '../../../graph/renderers/g6/g6-label-controller';
import { G6_INTERACTION_STATE } from '../../../graph/renderers/g6/g6-styles';
import type { G6RendererOptions } from '../../../graph/renderers/renderer-options';

describe('G6 renderer', () => {
	it('draws existing coordinates without invoking a G6 layout', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		let graphOptions:
			| Parameters<
					NonNullable<Parameters<typeof G6Renderer.create>[1]>
			  >[0]
			| undefined;

		const renderer = await G6Renderer.create(
			createOptions(graph),
			(options) => {
				graphOptions = options;
				return fake.instance;
			},
		);

		expect(renderer).toBeDefined();
		expect(fake.draw).toHaveBeenCalledOnce();
		expect(graphOptions).toMatchObject({
			animation: false,
			padding: 30,
			zoomRange: [0.001, 1000],
			behaviors: [
				{
					type: 'zoom-canvas',
					trigger: ['pinch'],
					animation: false,
				},
			],
		});
		expect(graphOptions).not.toHaveProperty('layout');
		expect(graphOptions).not.toHaveProperty('transforms');
		expect(graphOptions?.data?.nodes?.[0]).toMatchObject({
			id: 'A.md',
			style: {
				x: 10,
				y: 20,
				labelFontSize: 12,
				labelFontWeight: 'normal',
				labelFontStyle: 'normal',
				labelPlacement: 'right',
				labelOffsetX: 24,
			},
		});
		expect(graphOptions?.node).not.toHaveProperty('style');
	});

	it('coalesces viewport pan in CSS-pixel deltas at every zoom level', async () => {
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(createRuntimeGraph()),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		for (const zoomLevel of [25, 100, 400]) {
			renderer.setZoomLevel(zoomLevel);
			renderer.panViewportBy({ x: 40, y: -15 });
			renderer.panViewportBy({ x: 60, y: 5 });
			await Promise.resolve();
		}

		expect(fake.translateBy).toHaveBeenCalledTimes(3);
		expect(fake.translateBy).toHaveBeenNthCalledWith(1, [100, -10], false);
		expect(fake.translateBy).toHaveBeenNthCalledWith(2, [100, -10], false);
		expect(fake.translateBy).toHaveBeenNthCalledWith(3, [100, -10], false);
	});

	it('matches Sigma wheel zoom ratio, timing, origin, and throttling', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const container = createTestContainer();
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		container.dispatchEvent(createWheelEvent(-100, 110, 220));
		container.dispatchEvent(createWheelEvent(-100, 110, 220));
		container.dispatchEvent(createWheelEvent(100, 210, 320));

		expect(fake.zoomBy).toHaveBeenNthCalledWith(
			1,
			1.2,
			{ duration: 250, easing: 'out-quad' },
			[100, 200],
		);
		expect(fake.zoomBy).toHaveBeenNthCalledWith(
			2,
			1 / 1.2,
			{ duration: 250, easing: 'out-quad' },
			[200, 300],
		);
		expect(fake.zoomBy).toHaveBeenCalledTimes(2);

		renderer.kill();
		container.dispatchEvent(createWheelEvent(-100, 110, 220));
		expect(fake.zoomBy).toHaveBeenCalledTimes(2);
	});

	it('binds viewport events only after G6 finishes its initial draw', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		let initialized = false;
		const draw = vi.fn(async () => {
			initialized = true;
		});
		const getZoom = vi.fn(() => {
			if (!initialized) throw new Error('Viewport is not initialized');
			return 1;
		});
		const on = vi.fn((_event: string, listener: () => void) => listener());
		const instance = {
			...fake.instance,
			draw,
			getZoom,
			on,
		} as unknown as G6GraphInstance;

		await expect(
			G6Renderer.create(createOptions(graph), () => instance),
		).resolves.toBeDefined();
		expect(draw).toHaveBeenCalledOnce();
		expect(on).toHaveBeenCalledOnce();
		expect(getZoom).toHaveBeenCalledTimes(2);
	});

	it('resolves visible node hits for dock-to-graph dragging', async () => {
		const graph = createInteractiveGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		expect(renderer.getNodeAtViewportPosition({ x: 1, y: 1 })).toBe('A.md');
		expect(
			renderer.getNodeAtViewportPosition({ x: 400, y: 400 }),
		).toBeUndefined();

		graph.setNodeAttribute('A.md', 'hidden', true);
		graph.setNodeAttribute('B.md', 'isBend', true);
		expect(
			renderer.getNodeAtViewportPosition({ x: 1, y: 1 }),
		).toBeUndefined();
		expect(
			renderer.getNodeAtViewportPosition({ x: 21, y: 1 }),
		).toBeUndefined();
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

		await vi.waitFor(() => {
			expect(fake.setZoomRange).toHaveBeenCalledWith([135, 2160]);
			expect(fake.zoomTo).toHaveBeenLastCalledWith(540, false);
			expect(fake.translateBy).toHaveBeenCalledWith([400, 300], false);
			expect(zoomListener).toHaveBeenCalledWith(100);
		});
		fake.emitTransform();
		expect(zoomListener).toHaveBeenLastCalledWith(100);
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

	it('rebases the Sigma-compatible frame when graph extents change', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.fit();
		await vi.waitFor(() =>
			expect(fake.zoomTo).toHaveBeenLastCalledWith(540, false),
		);

		const expandedGraph = createRuntimeGraph();
		expandedGraph.addNode('B.md', {
			label: 'A very long label that must not affect coordinate fitting',
			x: 110,
			y: 120,
			size: 80,
			color: '#234567',
			path: 'B.md',
			folder: '',
			domains: [],
			tags: [],
		});
		renderer.setGraph(expandedGraph);

		await vi.waitFor(() =>
			expect(fake.zoomTo).toHaveBeenLastCalledWith(5.4, false),
		);
		expect(renderer.getZoomLevel()).toBe(100);
	});

	it('rebases native zoom on resize without changing logical zoom', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.fit();
		await vi.waitFor(() =>
			expect(fake.zoomTo).toHaveBeenLastCalledWith(540, false),
		);
		fake.resizeCanvasTo([400, 500]);
		renderer.resize();

		await vi.waitFor(() =>
			expect(fake.zoomTo).toHaveBeenLastCalledWith(740, false),
		);
		expect(renderer.getZoomLevel()).toBe(100);
	});

	it('does not rebuild graph visuals for pan-only viewport transforms', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		const zoomListener = vi.fn();
		renderer.onZoomLevelChange(zoomListener);
		const drawCount = fake.draw.mock.calls.length;
		const updateCount = fake.updateData.mock.calls.length;

		fake.emitTransform();
		await Promise.resolve();

		expect(fake.draw).toHaveBeenCalledTimes(drawCount);
		expect(fake.updateData).toHaveBeenCalledTimes(updateCount);
		expect(fake.setOptions).not.toHaveBeenCalled();
		expect(zoomListener).not.toHaveBeenCalled();
	});

	it('coalesces repeated draw requests while a draw is running', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		let releaseDraw: (() => void) | undefined;
		fake.draw.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					releaseDraw = resolve;
				}),
		);

		renderer.refresh();
		await vi.waitFor(() => expect(releaseDraw).toBeDefined());
		renderer.refresh();
		renderer.refresh();
		renderer.refresh();
		releaseDraw?.();

		await vi.waitFor(() => expect(fake.draw).toHaveBeenCalledTimes(3));
		await Promise.resolve();
		expect(fake.draw).toHaveBeenCalledTimes(3);
	});

	it('maps selection and hover semantics to incremental G6 states', async () => {
		const graph = createInteractiveGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setHovered('A.md');
		await Promise.resolve();
		const hoverPatch = readLastDataPatch(fake.updateData);
		expect(findStates(hoverPatch.nodes, 'A.md')).toEqual([
			G6_INTERACTION_STATE.hovered,
		]);
		expect(findStates(hoverPatch.nodes, 'B.md')).toBeUndefined();
		expect(findStates(hoverPatch.nodes, 'C.md')).toEqual([
			G6_INTERACTION_STATE.dimmed,
		]);
		expect(findStates(hoverPatch.edges, 'A-B')).toEqual([
			G6_INTERACTION_STATE.connected,
		]);
		expect(findStates(hoverPatch.edges, 'B-C')).toEqual([
			G6_INTERACTION_STATE.dimmed,
		]);

		renderer.togglePinnedHover('A.md');
		const focusPatch = readLastDataPatch(fake.updateData);
		expect(findStates(focusPatch.edges, 'A-B')).toEqual([
			G6_INTERACTION_STATE.connected,
		]);
		expect(findStates(focusPatch.edges, 'B-C')).toEqual([
			G6_INTERACTION_STATE.dimmed,
			G6_INTERACTION_STATE.focusHidden,
		]);
		renderer.togglePinnedHover('A.md');

		renderer.setSelectedEdge('logical-A-B');
		const edgeSelectionPatch = readLastDataPatch(fake.updateData);
		expect(findStates(edgeSelectionPatch.edges, 'A-B')).toEqual([
			G6_INTERACTION_STATE.connected,
			G6_INTERACTION_STATE.selected,
		]);

		renderer.setSelected('C.md');
		const nodeSelectionPatch = readLastDataPatch(fake.updateData);
		expect(findStates(nodeSelectionPatch.nodes, 'C.md')).toEqual([
			G6_INTERACTION_STATE.dimmed,
			G6_INTERACTION_STATE.selected,
		]);

		await vi.waitFor(() => expect(fake.draw).toHaveBeenCalledTimes(2));
		const updateCount = fake.updateData.mock.calls.length;
		renderer.setHovered(undefined);
		renderer.setHovered('B.md');
		await Promise.resolve();
		const directTransitionPatch = readLastDataPatch(fake.updateData);
		expect(fake.updateData).toHaveBeenCalledTimes(updateCount + 1);
		expect(findStates(directTransitionPatch.nodes, 'D.md')).toBeUndefined();
	});

	it('coalesces label appearance updates without updating graph data', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setLabelSize(9);
		renderer.setLabelBold(true);
		renderer.setLabelItalic(true);
		renderer.setLabelPosition('top');
		renderer.setLabelOffset(2);
		renderer.setLabelTheme({
			labelLightTextColor: '#123456',
			labelLightBackgroundColor: '#abcdef',
			labelLightBackgroundOpacity: 0.5,
			labelDarkTextColor: '#fedcba',
			labelDarkBackgroundColor: '#654321',
			labelDarkBackgroundOpacity: 0.5,
		});
		await vi.waitFor(() =>
			expect(fake.updateLabels).toHaveBeenCalledOnce(),
		);

		expect(fake.setOptions).not.toHaveBeenCalled();
		expect(fake.updateData).not.toHaveBeenCalled();
		expect(fake.draw).toHaveBeenCalledOnce();
		const snapshot = fake.updateLabels.mock.calls[0]?.[0];
		expect(snapshot?.nodeStyle).toMatchObject({
			labelFontSize: 9,
			labelFontWeight: 'bold',
			labelFontStyle: 'italic',
			labelFill: '#fedcba',
			labelPlacement: 'top',
			labelOffsetX: 0,
			labelOffsetY: -9,
		});
		expect(fake.setData).not.toHaveBeenCalled();
	});

	it('updates label density through a visibility data patch', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setLabelDensity(0.5);
		await vi.waitFor(() => expect(fake.draw).toHaveBeenCalledTimes(2));

		expect(fake.updateData).toHaveBeenCalledOnce();
		const labelPatch = readLastDataPatch(fake.updateData);
		expect(
			labelPatch.nodes?.filter((node) => node.style?.label).length,
		).toBe(1);
		expect(fake.replaceSnapshot).toHaveBeenCalledOnce();
	});

	it('does not reconfigure behaviors while an interaction label is active', async () => {
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(createRuntimeGraph()),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setHovered('A.md');
		await Promise.resolve();
		expect(fake.setOptions).not.toHaveBeenCalled();

		renderer.setHovered(undefined);
		await Promise.resolve();
		expect(fake.setOptions).not.toHaveBeenCalled();
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

function createInteractiveGraph(): RuntimeGraph {
	const graph = createRuntimeGraph();
	graph.addNode('B.md', {
		label: 'B',
		x: 30,
		y: 20,
		size: 8,
		color: '#234567',
		path: 'B.md',
		folder: '',
		domains: [],
		tags: [],
	});
	graph.addNode('C.md', {
		label: 'C',
		x: 50,
		y: 20,
		size: 8,
		color: '#345678',
		path: 'C.md',
		folder: '',
		domains: [],
		tags: [],
	});
	graph.addNode('D.md', {
		label: 'D',
		x: 70,
		y: 20,
		size: 8,
		color: '#456789',
		path: 'D.md',
		folder: '',
		domains: [],
		tags: [],
	});
	graph.addDirectedEdgeWithKey('A-B', 'A.md', 'B.md', {
		relation: 'leads-to',
		type: 'arrow',
		size: 1,
		color: '#456789',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
		logicalEdgeId: 'logical-A-B',
	});
	graph.addDirectedEdgeWithKey('B-C', 'B.md', 'C.md', {
		relation: 'leads-to',
		type: 'arrow',
		size: 1,
		color: '#56789a',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
		logicalEdgeId: 'logical-B-C',
	});
	return graph;
}

function createOptions(graph: RuntimeGraph): G6RendererOptions {
	return {
		graph,
		container: createTestContainer(),
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

function createTestContainer(): HTMLElement {
	const container = new EventTarget() as HTMLElement;
	container.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
	return container;
}

function createWheelEvent(
	deltaY: number,
	clientX: number,
	clientY: number,
): WheelEvent {
	return Object.assign(new Event('wheel', { cancelable: true }), {
		deltaX: 0,
		deltaY,
		clientX,
		clientY,
	}) as WheelEvent;
}

function createFakeG6(afterDraw?: () => void) {
	let zoom = 1;
	let canvasCenter: [number, number] = [400, 300];
	let nextCanvasCenter: [number, number] | undefined;
	let transformListener: (() => void) | undefined;
	const draw = vi.fn(async () => {
		afterDraw?.();
	});
	const destroy = vi.fn();
	const setData = vi.fn<(data: G6GraphData) => void>();
	const updateData = vi.fn();
	const updateLabels = vi.fn<(snapshot: G6LabelControllerSnapshot) => void>();
	const replaceSnapshot =
		vi.fn<(snapshot: G6LabelControllerSnapshot) => void>();
	const labelController = { updateLabels, replaceSnapshot };
	const focusElement = vi.fn(async () => undefined);
	const zoomBy = vi.fn(async (factor: number) => {
		zoom *= factor;
	});
	const zoomTo = vi.fn(async (value: number) => {
		zoom = value;
	});
	const setOptions =
		vi.fn<
			(options: Parameters<G6GraphInstance['setOptions']>[0]) => void
		>();
	const setZoomRange = vi.fn();
	const translateBy = vi.fn(async () => undefined);
	const resize = vi.fn(() => {
		if (!nextCanvasCenter) return;
		canvasCenter = nextCanvasCenter;
		nextCanvasCenter = undefined;
	});
	const instance = {
		destroy,
		draw,
		focusElement,
		getCanvasCenter: () => canvasCenter,
		getCanvasByViewport: ([x, y]: [number, number]) => [x + 10, y + 20],
		getPluginInstance: () => labelController,
		getViewportByCanvas: ([x, y]: [number, number]) => [x - 10, y - 20],
		getZoom: () => zoom,
		off: vi.fn(),
		on: vi.fn((_event: string, listener: () => void) => {
			transformListener = listener;
		}),
		resize,
		setData,
		setOptions,
		setZoomRange,
		translateBy,
		updateData,
		zoomBy,
		zoomTo,
	} as unknown as G6GraphInstance;
	return {
		instance,
		destroy,
		draw,
		focusElement,
		setData,
		setOptions,
		setZoomRange,
		translateBy,
		updateData,
		updateLabels,
		replaceSnapshot,
		zoomBy,
		zoomTo,
		resizeCanvasTo: (center: [number, number]) => {
			nextCanvasCenter = center;
		},
		emitTransform: () => transformListener?.(),
	};
}

type G6DataPatch = Exclude<
	Parameters<G6GraphInstance['updateData']>[0],
	(previous: G6GraphData) => unknown
>;

function readLastDataPatch(
	updateData: ReturnType<typeof createFakeG6>['updateData'],
): G6DataPatch {
	const patch = updateData.mock.calls.at(-1)?.[0] as G6DataPatch | undefined;
	if (!patch) throw new Error('Expected G6 data patch');
	return patch;
}

function findStates(
	items: readonly { id?: string; states?: readonly string[] }[] | undefined,
	id: string,
): readonly string[] | undefined {
	return items?.find((item) => item.id === id)?.states;
}
