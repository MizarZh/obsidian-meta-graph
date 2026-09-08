import Graphology from 'graphology';
import { describe, expect, it, vi } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '@/graph/model/graphology-adapter';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';
import {
	calculateViewportNodeLabelCapacity,
	G6Renderer,
	type G6GraphFactory,
	type G6GraphInstance,
} from '@/graph/renderers/g6/g6-renderer';
import type { G6GraphData } from '@/graph/renderers/g6/g6-data';
import type { G6LabelControllerSnapshot } from '@/graph/renderers/g6/g6-label-controller';
import { G6_INTERACTION_STATE } from '@/graph/renderers/g6/g6-styles';
import type { G6RendererOptions } from '@/graph/renderers/renderer-options';

describe('G6 renderer', () => {
	it('commits Group halos with force nodes and never reads ahead of a slow G6 batch', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const callbacks = new Map<number, FrameRequestCallback>();
		let frameId = 0;
		const window = container.ownerDocument.defaultView!;
		window.requestAnimationFrame = (callback) => {
			callbacks.set(++frameId, callback);
			return frameId;
		};
		window.cancelAnimationFrame = (id) => {
			callbacks.delete(id);
		};
		const flush = () => {
			const frames = [...callbacks.values()];
			callbacks.clear();
			frames.forEach((callback) => callback(0));
		};
		const drain = async () => {
			for (let i = 0; i < 16; i++) await Promise.resolve();
		};
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		renderer.setNodePosition('A.md', { x: 10, y: 20 });
		renderer.setLayoutGroupGeometries([
			{
				kind: 'member-halos',
				groupId: 'group',
				name: 'Group',
				color: '#7567f8',
				nodeIds: ['A.md'],
			},
		]);
		await drain();
		flush();
		await drain();
		const halo = () =>
			flattenFakeScene(fake.backgroundRoot)
				.filter(
					(element) =>
						element.style.fill === 'none' &&
						element.style.strokeOpacity === 0.65,
				)
				.at(-1)?.style.d;
		const initial = halo();
		expect(initial).toBeDefined();
		let finish!: () => void;
		const translate = fake.translateElementTo.getMockImplementation()!;
		fake.translateElementTo.mockImplementationOnce((positions) => {
			void translate(positions);
			return new Promise<void>((resolve) => {
				finish = resolve;
			});
		});
		graph.mergeNodeAttributes('A.md', { x: 321, y: -123 });
		renderer.syncForcePositions();
		expect(halo()).toEqual(initial);
		flush();
		await drain();
		const submitted = halo();
		expect(submitted).not.toEqual(initial);
		expect(renderer.getNodePosition('A.md')).toEqual({ x: 321, y: -123 });
		graph.mergeNodeAttributes('A.md', { x: 500, y: 200 });
		renderer.syncForcePositions();
		const layer = (
			renderer as unknown as {
				groupLayer: { invalidateGeometry(): void };
			}
		).groupLayer;
		layer.invalidateGeometry();
		flush();
		await drain();
		expect(halo()).toEqual(submitted);
		finish();
		await drain();
		flush();
		await drain();
		expect(halo()).not.toEqual(submitted);
		expect(renderer.getNodePosition('A.md')).toEqual({ x: 500, y: 200 });
		renderer.kill();
	});
	it('patches force positions through the stable coordinate adapter without fitting or replacing data', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const frames = createManualFrameTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container: frames.container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		const before = renderer.graphToViewportPosition({ x: 1, y: 2 });
		fake.setData.mockClear();
		fake.translateElementTo.mockClear();
		graph.mergeNodeAttributes('A.md', { x: 321, y: -123 });
		renderer.beginForceMotion();
		renderer.syncForcePositions();
		expect(fake.translateElementTo).not.toHaveBeenCalled();
		frames.flush();
		for (let i = 0; i < 12; i++) await Promise.resolve();
		expect(fake.translateElementTo).toHaveBeenCalledWith(
			expect.objectContaining({ 'A.md': [155510, 71520] }),
			false,
		);
		expect(fake.updateData).not.toHaveBeenCalled();
		expect(renderer.graphToViewportPosition({ x: 1, y: 2 })).toEqual(
			before,
		);
		expect(fake.setData).not.toHaveBeenCalled();
		expect(renderer.capabilities.supportsExternal2DForceSimulation).toBe(
			true,
		);
		renderer.kill();
		fake.translateElementTo.mockClear();
		renderer.syncForcePositions();
		expect(fake.translateElementTo).not.toHaveBeenCalled();
	});
	it('coalesces force ticks, skips unchanged nodes and retains the latest position during a slow draw', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const frames = createManualFrameTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container: frames.container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		const drain = async () => {
			for (let i = 0; i < 12; i++) await Promise.resolve();
		};
		renderer.syncForcePositions();
		frames.flush();
		await drain();
		fake.translateElementTo.mockClear();
		fake.draw.mockClear();
		renderer.syncForcePositions();
		frames.flush();
		await drain();
		expect(fake.translateElementTo).not.toHaveBeenCalled();
		expect(fake.draw).not.toHaveBeenCalled();
		let finishDraw!: () => void;
		fake.translateElementTo.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishDraw = resolve;
				}),
		);
		for (let x = 10; x <= 100; x++) {
			graph.setNodeAttribute('A.md', 'x', x);
			renderer.syncForcePositions();
		}
		expect(fake.translateElementTo).not.toHaveBeenCalled();
		frames.flush();
		await drain();
		expect(fake.translateElementTo).toHaveBeenCalledTimes(1);
		expect(fake.translateElementTo).toHaveBeenLastCalledWith(
			{ 'A.md': [45010, 20] },
			false,
		);
		for (let x = 101; x <= 200; x++) {
			graph.setNodeAttribute('A.md', 'x', x);
			renderer.syncForcePositions();
		}
		frames.flush();
		await drain();
		expect(fake.translateElementTo).toHaveBeenCalledTimes(1);
		finishDraw();
		await drain();
		frames.flush();
		await drain();
		expect(fake.translateElementTo).toHaveBeenCalledTimes(2);
		expect(fake.translateElementTo).toHaveBeenLastCalledWith(
			{ 'A.md': [95010, 20] },
			false,
		);
		expect(fake.draw).not.toHaveBeenCalled();
		renderer.syncForcePositions();
		renderer.kill();
		fake.translateElementTo.mockClear();
		frames.flush();
		await drain();
		expect(fake.translateElementTo).not.toHaveBeenCalled();
	});
	it('moves nodes through the G6 model and mirrors the applied position', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		renderer.setNodePosition('A.md', { x: 321, y: -123 });
		expect(fake.translateElementTo).toHaveBeenCalledExactlyOnceWith(
			{ 'A.md': [155510, 71520] },
			false,
		);
		expect(renderer.getNodePosition('A.md')).toEqual({ x: 321, y: -123 });
		expect(graph.getNodeAttributes('A.md')).toMatchObject({
			x: 321,
			y: -123,
		});
		renderer.moveNodesBy(['A.md'], { x: 4, y: 5 });
		expect(fake.translateElementTo).toHaveBeenLastCalledWith(
			{ 'A.md': [157510, 69020] },
			false,
		);
		expect(renderer.getNodePosition('A.md')).toEqual({ x: 325, y: -118 });
		expect(fake.draw).toHaveBeenCalledOnce();
		renderer.kill();
	});
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
		expect(graphOptions?.transforms).toEqual([
			'meta-graph-state-update',
			'meta-graph-position-update',
		]);
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

	it('coalesces continuous trackpad input into one direct camera step', async () => {
		const graph = createRuntimeGraph();
		const fake = createFakeG6();
		const container = createTestContainer();
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		container.dispatchEvent(createWheelEvent(-25, 110, 220));
		container.dispatchEvent(createWheelEvent(-25, 110, 220));
		await vi.waitFor(() => expect(fake.zoomBy).toHaveBeenCalledOnce());
		expect(fake.zoomBy.mock.calls.at(-1)?.[0]).toBeCloseTo(Math.sqrt(1.2));
		expect(fake.zoomBy.mock.calls.at(-1)?.slice(1)).toEqual([
			false,
			[100, 200],
		]);

		container.dispatchEvent(createWheelEvent(25, 210, 320));
		await vi.waitFor(() => expect(fake.zoomBy).toHaveBeenCalledTimes(2));
		expect(fake.zoomBy.mock.calls.at(-1)?.[0]).toBeCloseTo(1 / 1.2 ** 0.25);
		expect(fake.zoomBy.mock.calls.at(-1)?.slice(1)).toEqual([
			false,
			[200, 300],
		]);

		renderer.kill();
		container.dispatchEvent(createWheelEvent(-100, 110, 220));
		expect(fake.zoomBy).toHaveBeenCalledTimes(2);
	});

	it('interpolates a discrete mouse-wheel step for a bounded duration', async () => {
		const fake = createFakeG6();
		const frames = createManualFrameTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{
				...createOptions(createRuntimeGraph()),
				container: frames.container,
			},
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		frames.container.dispatchEvent(createWheelEvent(-100, 110, 220));
		fake.updateZoomScale.mockClear();
		frames.flush(performance.now() + 30);
		await Promise.resolve();
		fake.emitTransform();
		expect(fake.zoomBy).toHaveBeenCalledOnce();
		expect(fake.instance.getZoom()).toBeGreaterThan(1);
		expect(fake.instance.getZoom()).toBeLessThan(1.2);
		expect(fake.updateLabels).not.toHaveBeenCalled();
		expect(fake.updateZoomScale).toHaveBeenCalledOnce();
		expect(frames.pendingCount()).toBe(1);

		frames.flush(performance.now() + 100);
		await Promise.resolve();
		fake.emitTransform();
		expect(fake.instance.getZoom()).toBeCloseTo(1.2);
		expect(frames.pendingCount()).toBe(0);
		expect(fake.updateLabels).not.toHaveBeenCalled();
		expect(fake.updateZoomScale).toHaveBeenCalledTimes(2);
		renderer.kill();
	});

	it('uses one viewport frame and lets pan preempt pending wheel zoom', async () => {
		const fake = createFakeG6();
		const frames = createManualFrameTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{
				...createOptions(createRuntimeGraph()),
				container: frames.container,
			},
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		frames.container.dispatchEvent(createWheelEvent(-100, 110, 220));
		expect(frames.pendingCount()).toBe(1);

		renderer.beginViewportPan();
		renderer.panViewportBy({ x: 25, y: -10 });
		expect(frames.pendingCount()).toBe(1);
		frames.flush(performance.now() + 100);
		await Promise.resolve();

		expect(fake.zoomBy).not.toHaveBeenCalled();
		expect(fake.translateBy).toHaveBeenCalledOnce();
		expect(fake.translateBy).toHaveBeenCalledWith([25, -10], false);

		renderer.endViewportPan();
		frames.container.dispatchEvent(createWheelEvent(-100, 110, 220));
		expect(frames.pendingCount()).toBe(1);
		frames.flush(performance.now() + 100);
		await vi.waitFor(() => expect(fake.zoomBy).toHaveBeenCalledOnce());
		expect(fake.zoomBy).toHaveBeenCalledWith(1.2, false, [110, 220]);
		expect(frames.pendingCount()).toBe(0);
		renderer.kill();
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
			(options) => {
				fake.loadData(options.data as G6GraphData);
				return fake.instance;
			},
		);
		if (!renderer) throw new Error('Expected renderer');
		const aPosition = renderer.graphToViewportPosition({ x: 10, y: 20 });
		const bPosition = renderer.graphToViewportPosition({ x: 30, y: 20 });
		fake.getCanvasByViewport.mockClear();

		expect(renderer.getNodeAtViewportPosition(aPosition)).toBe('A.md');
		expect(fake.getCanvasByViewport).toHaveBeenCalledOnce();
		expect(
			renderer.getNodeAtViewportPosition({ x: 400, y: 400 }),
		).toBeUndefined();

		graph.setNodeAttribute('A.md', 'hidden', true);
		graph.setNodeAttribute('B.md', 'isBend', true);
		expect(renderer.getNodeAtViewportPosition(aPosition)).toBeUndefined();
		expect(renderer.getNodeAtViewportPosition(bPosition)).toBeUndefined();
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
		const graphPosition = renderer.viewportToGraphPosition({ x: 2, y: 3 });
		expect(graphPosition).toEqual({ x: 10.004, y: 19.994 });
		const viewportPosition =
			renderer.graphToViewportPosition(graphPosition);
		expect(viewportPosition.x).toBeCloseTo(2);
		expect(viewportPosition.y).toBeCloseTo(3);

		await vi.waitFor(() => {
			expect(fake.setZoomRange).toHaveBeenCalledWith([0.27, 4.32]);
			expect(fake.zoomTo).toHaveBeenLastCalledWith(1.08, false);
			expect(fake.translateBy).toHaveBeenCalledWith([400, 300], false);
			expect(zoomListener).toHaveBeenCalledWith(100);
		});
		const fitPatch = readLastDataPatch(fake.updateData);
		const fittedNodeStyle = fitPatch.nodes?.find(
			(node) => node.id === 'A.md',
		)?.style;
		expect(Number(fittedNodeStyle?.size) * 1.08).toBeCloseTo(16);
		expect(Number(fittedNodeStyle?.labelFontSize) * 1.08).toBeCloseTo(12);
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
			expect(fake.zoomTo).toHaveBeenLastCalledWith(1.08, false),
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
			expect(fake.zoomTo).toHaveBeenLastCalledWith(1.08, false),
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
			expect(fake.zoomTo).toHaveBeenLastCalledWith(1.08, false),
		);
		fake.resizeCanvasTo([400, 500]);
		renderer.resize();

		await vi.waitFor(() =>
			expect(fake.zoomTo).toHaveBeenLastCalledWith(1.48, false),
		);
		expect(renderer.getZoomLevel()).toBe(100);
	});

	it('rebuilds cached Group geometry after the initial fit baseline', async () => {
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(createRuntimeGraph()),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		const invalidateGeometry = vi.fn();
		(
			renderer as unknown as {
				groupLayer: { invalidateGeometry(): void };
			}
		).groupLayer = { invalidateGeometry };

		renderer.fit();

		await vi.waitFor(() =>
			expect(invalidateGeometry).toHaveBeenCalledOnce(),
		);
	});

	it('renders Groups in the G6 background scene without transform rebuilds', async () => {
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(createRuntimeGraph()), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setGroups([
			{
				id: 'group-1',
				name: 'Group 1',
				color: '#7567f8',
				mode: 'manual',
				shape: 'rectangle',
				padding: 0.3,
				x: -20,
				y: -10,
				width: 80,
				height: 60,
			},
		]);
		renderer.setLayoutGroupGeometries([
			{
				kind: 'member-halos',
				groupId: 'group-1',
				name: 'Group 1',
				color: '#7567f8',
				nodeIds: ['A.md', 'B.md'],
			},
		]);
		await vi.waitFor(() => {
			const elements = flattenFakeScene(fake.backgroundRoot);
			expect(
				elements.some((element) => element.style.fillOpacity === 0.06),
			).toBe(true);
			expect(
				elements.some(
					(element) =>
						element.style.fill === 'none' &&
						element.style.strokeOpacity === 0.65,
				),
			).toBe(true);
		});
		const sceneRoot = fake.backgroundRoot.children[0];
		const sceneChildren = sceneRoot?.children.length;
		const sceneElements = flattenFakeScene(fake.backgroundRoot);
		const region = sceneElements.find(
			(element) => element.style.fillOpacity === 0.06,
		);
		const halo = sceneElements.find(
			(element) =>
				element.style.fill === 'none' &&
				element.style.strokeOpacity === 0.65,
		);
		expect(region?.style).toMatchObject({
			lineWidth: 1.5,
			isSizeAttenuation: true,
		});
		expect(halo?.style).toMatchObject({
			lineWidth: 1.5,
			isSizeAttenuation: true,
		});

		fake.emitTransform();
		await Promise.resolve();

		expect(fake.backgroundRoot.children[0]).toBe(sceneRoot);
		expect(sceneRoot?.children.length).toBe(sceneChildren);
		renderer.kill();
		expect(sceneRoot?.destroy).toHaveBeenCalledOnce();
	});

	it('renders an Arc layout Group on its first scene commit', async () => {
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(createRuntimeGraph()), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setLayoutGroupGeometries([
			{
				kind: 'arc-band',
				groupId: 'group-1',
				name: 'Group 1',
				color: '#7567f8',
				nodeIds: ['A.md', 'B.md'],
				direction: 'right',
				start: -40,
				end: 40,
				halfWidth: 12,
			},
		]);

		await vi.waitFor(() => {
			const region = flattenFakeScene(fake.backgroundRoot).find(
				(element) => element.style.fillOpacity === 0.06,
			);
			expect(region?.ownerDocument).toBe(
				fake.backgroundRoot.ownerDocument,
			);
			expect(region?.style.d).toContain('M ');
		});
		renderer.kill();
	});

	it('coalesces the complete Group scene independently of a pending graph draw', async () => {
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(createRuntimeGraph()), container },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		let finishDraw: (() => void) | undefined;
		fake.draw.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishDraw = resolve;
				}),
		);
		const graph = createRuntimeGraph();
		graph.setNodeAttribute('A.md', 'x', 140);
		graph.setNodeAttribute('A.md', 'y', -80);
		renderer.setGraph(graph);
		renderer.setLayoutGroupGeometries([
			{
				kind: 'member-halos',
				groupId: 'group-1',
				name: 'Group 1',
				color: '#7567f8',
				nodeIds: ['A.md', 'B.md'],
			},
		]);
		renderer.setGroups([
			{
				id: 'group-1',
				name: 'Group 1',
				color: '#7567f8',
				mode: 'rule',
				shape: 'rectangle',
				padding: 0.3,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
				dynamicNodeIds: ['A.md', 'B.md'],
			},
		]);

		await vi.waitFor(() => {
			expect(finishDraw).toBeTypeOf('function');
			const elements = flattenFakeScene(fake.backgroundRoot);
			const region = elements.find(
				(element) => element.style.fillOpacity === 0.06,
			);
			const halo = elements.find(
				(element) =>
					element.style.fill === 'none' &&
					element.style.strokeOpacity === 0.65,
			);
			expect(Number(region?.style.width)).toBeGreaterThan(0);
			expect(Number(region?.style.height)).toBeGreaterThan(0);
			expect(halo).toBeDefined();
		});
		finishDraw?.();
		renderer.kill();
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

	it('keeps 25%-400% zoom on the camera path without rebuilding graph data', async () => {
		const graph = createInteractiveGraph();
		graph.forEachNode((nodeId) =>
			graph.mergeNodeAttributes(nodeId, {
				labelRotation: Math.PI / 4,
				labelDirection: 1,
			}),
		);
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container, labelDensity: 0.25 },
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.fit();
		await vi.waitFor(() => expect(fake.updateData).toHaveBeenCalledOnce());
		const baselinePatch = readLastDataPatch(fake.updateData);
		const baselineNodeSize = Number(
			baselinePatch.nodes?.find((node) => node.id === 'A.md')?.style
				?.size,
		);
		const baselineEdge = baselinePatch.edges?.find(
			(edge) => edge.id === 'A-B',
		)?.style;
		const baselineLineWidth = Number(baselineEdge?.lineWidth);
		const baselineArrowSize = baselineEdge?.endArrowSize as
			[number, number] | undefined;
		const baselineNativeZoom = fake.instance.getZoom();
		const baselineNodeScreenSize = baselineNodeSize * baselineNativeZoom;
		const baselineEdgeScreenWidth = baselineLineWidth * baselineNativeZoom;
		const baselineArrowScreenSize = baselineArrowSize?.map(
			(value) => value * baselineNativeZoom,
		);
		fake.updateData.mockClear();
		fake.setOptions.mockClear();
		fake.draw.mockClear();
		fake.updateLabels.mockClear();
		fake.updateZoomScale.mockClear();

		for (const level of [25, 100, 400]) {
			renderer.setZoomLevel(level);
			await Promise.resolve();
			fake.emitTransform();
			const nativeZoom = fake.instance.getZoom();
			expect(baselineNodeSize * nativeZoom).toBeCloseTo(
				baselineNodeScreenSize * (level / 100),
			);
			expect(baselineLineWidth * nativeZoom).toBeCloseTo(
				baselineEdgeScreenWidth * (level / 100),
			);
			baselineArrowSize?.forEach((value, index) => {
				expect(value * nativeZoom).toBeCloseTo(
					(baselineArrowScreenSize?.[index] ?? 0) * (level / 100),
				);
			});
			expect(fake.updateLabels).not.toHaveBeenCalled();
			expect(fake.updateZoomScale.mock.calls.at(-1)?.[0]).toBeCloseTo(
				100 / level,
			);
		}

		expect(fake.updateLabels).not.toHaveBeenCalled();
		renderer.setScaleLabelsWithZoom(true);
		expect(fake.updateZoomScale.mock.calls.at(-1)?.[0]).toBeCloseTo(0.5);
		expect(fake.updateData).not.toHaveBeenCalled();
		expect(fake.setOptions).not.toHaveBeenCalled();
		expect(fake.draw).not.toHaveBeenCalled();
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
		const setFocusedNode = vi.fn();
		(
			renderer as unknown as {
				groupLayer: { setFocusedNode(nodeId?: string): void };
			}
		).groupLayer = { setFocusedNode };

		renderer.setHovered('A.md');
		await Promise.resolve();
		expect(setFocusedNode).toHaveBeenLastCalledWith(undefined);
		const hoverStates = readLastStateMap(fake.setElementState);
		expect(fake.setElementState).toHaveBeenLastCalledWith(
			expect.any(Object),
			false,
		);
		expect(hoverStates['A.md']).toEqual([G6_INTERACTION_STATE.hovered]);
		expect(hoverStates['B.md']).toBeUndefined();
		expect(hoverStates['C.md']).toEqual([G6_INTERACTION_STATE.dimmed]);
		expect(hoverStates['D.md']).toEqual([G6_INTERACTION_STATE.dimmed]);
		expect(hoverStates['A-B']).toEqual([G6_INTERACTION_STATE.connected]);
		expect(hoverStates['B-C']).toEqual([
			G6_INTERACTION_STATE.dimmed,
			G6_INTERACTION_STATE.focusHidden,
		]);

		const hoverStateCount = fake.setElementState.mock.calls.length;
		renderer.togglePinnedHover('A.md');
		expect(setFocusedNode).toHaveBeenLastCalledWith('A.md');
		expect(fake.setElementState).toHaveBeenCalledTimes(hoverStateCount);
		renderer.togglePinnedHover('A.md');
		expect(setFocusedNode).toHaveBeenLastCalledWith(undefined);
		expect(fake.setElementState).toHaveBeenCalledTimes(hoverStateCount);

		renderer.setSelectedEdge('logical-A-B');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['A-B']).toContain(
				G6_INTERACTION_STATE.selected,
			),
		);
		const edgeSelectionStates = readLastStateMap(fake.setElementState);
		expect(edgeSelectionStates['A-B']).toEqual([
			G6_INTERACTION_STATE.connected,
			G6_INTERACTION_STATE.selected,
		]);

		renderer.setSelected('C.md');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toContain(
				G6_INTERACTION_STATE.selected,
			),
		);
		const nodeSelectionStates = readLastStateMap(fake.setElementState);
		expect(nodeSelectionStates['C.md']).toEqual([
			G6_INTERACTION_STATE.dimmed,
			G6_INTERACTION_STATE.selected,
		]);

		expect(fake.draw).toHaveBeenCalledOnce();
		const stateCount = fake.setElementState.mock.calls.length;
		renderer.setHovered(undefined);
		renderer.setHovered('B.md');
		await Promise.resolve();
		const directTransitionStates = readLastStateMap(fake.setElementState);
		expect(fake.setElementState).toHaveBeenCalledTimes(stateCount + 1);
		expect(directTransitionStates['D.md']).toBeUndefined();
	});

	it('keeps node-to-node hover within one frame across a short leave gap', async () => {
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		const renderer = await G6Renderer.create(
			{
				...createOptions(createInteractiveGraph()),
				container,
			},
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		renderer.setHovered('A.md');
		await vi.waitFor(() => expect(fake.setElementState).toHaveBeenCalled());
		fake.setElementState.mockClear();

		renderer.setHovered(undefined);
		renderer.setHovered('B.md');
		await vi.waitFor(() =>
			expect(fake.setElementState).toHaveBeenCalledOnce(),
		);
		const browserWindow = container.ownerDocument.defaultView;
		if (!browserWindow) throw new Error('Expected browser window');
		await new Promise<void>((resolve) =>
			browserWindow.setTimeout(resolve, 100),
		);

		expect(fake.setElementState).toHaveBeenCalledOnce();
	});

	it('keeps one state draw in flight and replaces queued hover with latest state', async () => {
		const fake = createFakeG6();
		let releaseFirstStateDraw: (() => void) | undefined;
		fake.setElementState.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					releaseFirstStateDraw = resolve;
				}),
		);
		const renderer = await G6Renderer.create(
			createOptions(createInteractiveGraph()),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setHovered('A.md');
		await vi.waitFor(() => expect(releaseFirstStateDraw).toBeDefined());
		renderer.setHovered('B.md');
		await Promise.resolve();
		renderer.setHovered('C.md');
		await Promise.resolve();
		expect(fake.setElementState).toHaveBeenCalledOnce();

		releaseFirstStateDraw?.();
		await vi.waitFor(() =>
			expect(fake.setElementState).toHaveBeenCalledTimes(2),
		);
		const finalStates = readLastStateMap(fake.setElementState);
		expect(finalStates['C.md']).toEqual([G6_INTERACTION_STATE.hovered]);
		expect(finalStates['A.md']).toEqual([G6_INTERACTION_STATE.dimmed]);
	});

	it('switches hover mode live while Space pin still applies local focus', async () => {
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(createInteractiveGraph()),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');
		renderer.setHovered('A.md');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toContain(
				G6_INTERACTION_STATE.dimmed,
			),
		);
		renderer.setHoverMode('emphasis');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toEqual([]),
		);
		expect(readLastStateMap(fake.setElementState)['B-C']).toEqual([]);
		renderer.togglePinnedHover('A.md');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toContain(
				G6_INTERACTION_STATE.dimmed,
			),
		);
		renderer.clearPinnedHover();
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toEqual([]),
		);
		renderer.setHoverMode('local');
		await vi.waitFor(() =>
			expect(readLastStateMap(fake.setElementState)['C.md']).toContain(
				G6_INTERACTION_STATE.dimmed,
			),
		);
		renderer.kill();
	});

	it('uses pinned-focus dimming for transient hover without a second full update when pinned', async () => {
		const graph = createLargeLabelGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.setHovered('A.md');
		await Promise.resolve();
		const hoverStates = readLastStateMap(fake.setElementState);
		expect(Object.keys(hoverStates).length).toBeGreaterThan(500);

		fake.setElementState.mockClear();
		renderer.togglePinnedHover('A.md');
		expect(fake.setElementState).not.toHaveBeenCalled();
	});

	it('only patches elements present in routed Flow G6 data', async () => {
		const graph = createInteractiveGraph();
		const bendNodeId = '__flow-bend__logical-A-B__1';
		graph.addNode(bendNodeId, {
			label: 'Bend',
			x: 20,
			y: 30,
			size: 1,
			color: '#000000',
			path: '',
			folder: '',
			domains: [],
			tags: [],
			isBend: true,
		});
		const edgeRoutes = new Map<string, PlanarEdgeRoute>([
			[
				'logical-A-B',
				{
					id: 'logical-A-B',
					source: 'A.md',
					target: 'B.md',
					start: { x: 10, y: 20 },
					commands: [
						{ kind: 'line', to: { x: 20, y: 30 } },
						{ kind: 'line', to: { x: 30, y: 20 } },
					],
					parallelRouteOwner: 'layout',
				},
			],
		]);
		const fake = createFakeG6();
		const renderedNodeIds = new Set<string>();
		const renderedEdgeIds = new Set<string>();
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), edgeRoutes },
			(options) => {
				const data = options.data as G6GraphData;
				data.nodes.forEach(({ id }) => renderedNodeIds.add(id));
				data.edges.forEach(({ id }) => renderedEdgeIds.add(id));
				fake.updateData.mockImplementation((patch: G6DataPatch) => {
					for (const node of patch.nodes ?? []) {
						if (!renderedNodeIds.has(String(node.id))) {
							throw new Error(
								`Unknown G6 node: ${String(node.id)}`,
							);
						}
					}
					for (const edge of patch.edges ?? []) {
						if (!renderedEdgeIds.has(String(edge.id))) {
							throw new Error(
								`Unknown G6 edge: ${String(edge.id)}`,
							);
						}
					}
				});
				return fake.instance;
			},
		);
		if (!renderer) throw new Error('Expected renderer');

		expect(renderedNodeIds.has(bendNodeId)).toBe(false);
		const baselineUpdates = fake.updateData.mock.calls.length;
		renderer.refreshGraphStyles();
		expect(fake.updateData).toHaveBeenCalledTimes(baselineUpdates);
		renderer.setLabelDensity(0.5);
		renderer.setHovered('A.md');
		renderer.fit();
		await vi.waitFor(() =>
			expect(fake.updateData.mock.calls.length).toBeGreaterThanOrEqual(
				baselineUpdates + 2,
			),
		);
		await vi.waitFor(() => expect(fake.setElementState).toHaveBeenCalled());
		const activeStateUpdates = fake.setElementState.mock.calls.length;
		renderer.setHovered(undefined);
		await vi.waitFor(() =>
			expect(fake.setElementState.mock.calls.length).toBeGreaterThan(
				activeStateUpdates,
			),
		);

		const updatedNodeIds = fake.updateData.mock.calls.flatMap(([patch]) =>
			((patch as G6DataPatch).nodes ?? []).map((node) => node.id),
		);
		expect(updatedNodeIds).not.toContain(bendNodeId);
		for (const [states] of fake.setElementState.mock.calls) {
			expect(Object.keys(states)).not.toContain(bendNodeId);
		}
		const snapshot = fake.replaceSnapshot.mock.calls.at(-1)?.[0];
		expect(snapshot?.nodeIds.has(bendNodeId)).toBe(false);
		renderer.kill();
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
		renderer.setScaleLabelsWithZoom(true);
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

	it('submits only dirty node and edge ids for style refresh', async () => {
		const graph = createInteractiveGraph();
		const fake = createFakeG6();
		const renderer = await G6Renderer.create(
			createOptions(graph),
			() => fake.instance,
		);
		if (!renderer) throw new Error('Expected renderer');

		renderer.refreshGraphStyles();
		expect(fake.updateData).not.toHaveBeenCalled();
		graph.setNodeAttribute('B.md', 'color', '#abcdef');
		graph.setEdgeAttribute('A-B', 'size', 3);
		renderer.refreshGraphStyles();

		const patch = readLastDataPatch(fake.updateData);
		expect(patch.nodes?.map(({ id }) => id)).toEqual(['B.md']);
		expect(patch.edges?.map(({ id }) => id)).toEqual(['A-B']);
	});

	it('updates only label ids changed by density', async () => {
		const graph = createInteractiveGraph();
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
		expect(labelPatch.nodes).toHaveLength(2);
		expect(labelPatch.nodes?.every((node) => !node.style?.label)).toBe(
			true,
		);
		expect(fake.replaceSnapshot).toHaveBeenCalledOnce();

		const updateCount = fake.updateData.mock.calls.length;
		const drawCount = fake.draw.mock.calls.length;
		renderer.setLabelDensity(0.5);
		await Promise.resolve();
		expect(fake.updateData).toHaveBeenCalledTimes(updateCount);
		expect(fake.draw).toHaveBeenCalledTimes(drawCount);

		renderer.setLabelDensity(0.75);
		await vi.waitFor(() =>
			expect(fake.updateData).toHaveBeenCalledTimes(updateCount + 1),
		);
		const expandedPatch = readLastDataPatch(fake.updateData);
		expect(expandedPatch.nodes).toHaveLength(1);
		expect(expandedPatch.nodes?.[0]?.style?.label).toBe(true);
	});

	it('caps labels by viewport without mutating labels during transforms', async () => {
		const graph = createLargeLabelGraph();
		const fake = createFakeG6();
		const container = createBrowserTestContainer(800, 600);
		let graphOptions: Parameters<G6GraphFactory>[0] | undefined;
		const renderer = await G6Renderer.create(
			{ ...createOptions(graph), container },
			(options) => {
				graphOptions = options;
				return fake.instance;
			},
		);
		if (!renderer) throw new Error('Expected renderer');

		expect(calculateViewportNodeLabelCapacity(800, 600)).toBe(133);
		const data = graphOptions?.data as G6GraphData;
		expect(data.nodes.filter((node) => node.style.label).length).toBe(133);

		fake.updateLabels.mockClear();
		fake.updateZoomScale.mockClear();
		await fake.zoomTo(2);
		fake.emitTransform();
		expect(fake.updateLabels).not.toHaveBeenCalled();
		expect(fake.updateZoomScale).toHaveBeenCalledOnce();
		renderer.kill();
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

function createLargeLabelGraph(): RuntimeGraph {
	const graph = createRuntimeGraph();
	for (let index = 1; index < 600; index += 1) {
		graph.addNode(`node-${index}.md`, {
			label: `Node ${index}`,
			x: index,
			y: index % 20,
			size: 8,
			color: '#234567',
			path: `node-${index}.md`,
			folder: '',
			domains: [],
			tags: [],
		});
	}
	graph.addDirectedEdgeWithKey('large-edge', 'A.md', 'node-1.md', {
		relation: 'leads-to',
		type: 'arrow',
		size: 1,
		color: '#456789',
		hidden: false,
		label: 'Large edge',
		forceLabel: true,
		lineStyle: 'solid',
		logicalEdgeId: 'large-edge',
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

function createBrowserTestContainer(
	width: number,
	height: number,
): HTMLElement {
	const container = createTestContainer();
	container.getBoundingClientRect = () =>
		({ left: 0, top: 0, width, height }) as DOMRect;
	const browserWindow = {
		requestAnimationFrame: (callback: FrameRequestCallback) =>
			// Test-only timer standing in for the active popout window.
			// eslint-disable-next-line obsidianmd/prefer-window-timers
			setTimeout(() => callback(performance.now()), 0),
		// eslint-disable-next-line obsidianmd/prefer-window-timers
		cancelAnimationFrame: (handle: number) => clearTimeout(handle),
		setTimeout,
		clearTimeout,
		getComputedStyle: () => ({ getPropertyValue: () => '' }),
	};
	const createSvgElement = () => {
		const element = new EventTarget() as unknown as SVGElement;
		Object.assign(element, {
			classList: { add: vi.fn(), toggle: vi.fn() },
			style: { display: '', setProperty: vi.fn() },
			setAttribute: vi.fn(),
			append: vi.fn(),
			appendChild: vi.fn(),
			replaceChildren: vi.fn(),
			remove: vi.fn(),
		});
		return element;
	};
	Object.assign(container, { appendChild: vi.fn() });
	Object.defineProperty(container, 'ownerDocument', {
		value: {
			defaultView: browserWindow,
			createElementNS: createSvgElement,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		},
	});
	return container;
}

function createManualFrameTestContainer(
	width: number,
	height: number,
): {
	container: HTMLElement;
	flush(now?: number): void;
	pendingCount(): number;
} {
	const container = createTestContainer();
	container.getBoundingClientRect = () =>
		({ left: 0, top: 0, width, height }) as DOMRect;
	let nextFrame = 1;
	const frames = new Map<number, FrameRequestCallback>();
	const browserWindow = {
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			const handle = nextFrame++;
			frames.set(handle, callback);
			return handle;
		},
		cancelAnimationFrame: (handle: number) => frames.delete(handle),
		setTimeout,
		clearTimeout,
	};
	Object.defineProperty(container, 'ownerDocument', {
		value: { defaultView: browserWindow },
	});
	return {
		container,
		flush: (now = performance.now()) => {
			const pending = [...frames.values()];
			frames.clear();
			for (const callback of pending) callback(now);
		},
		pendingCount: () => frames.size,
	};
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

interface FakeSceneElement {
	style: Record<string, unknown>;
	children: FakeSceneElement[];
	ownerDocument: FakeSceneDocument;
	appendChild(child: FakeSceneElement): FakeSceneElement;
	destroy: ReturnType<typeof vi.fn>;
	setAttributes(attributes: Record<string, unknown>): void;
}

interface FakeSceneDocument {
	createElement(
		tagName: string,
		options: { style: Record<string, unknown> },
	): FakeSceneElement;
}

function flattenFakeScene(root: FakeSceneElement): FakeSceneElement[] {
	return [root, ...root.children.flatMap(flattenFakeScene)];
}

function createFakeG6(afterDraw?: () => void) {
	const createSceneDocument = (): FakeSceneDocument => {
		const document = {} as FakeSceneDocument;
		document.createElement = (
			_tagName: string,
			options: { style: Record<string, unknown> },
		) => createSceneElement(document, options.style);
		return document;
	};
	const createSceneElement = (
		ownerDocument: FakeSceneDocument,
		style: Record<string, unknown> = {},
	): FakeSceneElement => {
		const children: FakeSceneElement[] = [];
		return {
			style,
			children,
			ownerDocument,
			appendChild(child: ReturnType<typeof createSceneElement>) {
				if (child.ownerDocument !== ownerDocument)
					throw new Error(
						'Cannot append a scene element across documents',
					);
				children.push(child);
				return child;
			},
			destroy: vi.fn(() => {
				children.length = 0;
			}),
			setAttributes(attributes: Record<string, unknown>) {
				Object.assign(style, attributes);
			},
		};
	};
	const mainDocument = createSceneDocument();
	const backgroundDocument = createSceneDocument();
	const backgroundRoot = createSceneElement(backgroundDocument);
	const mainRoot = createSceneElement(mainDocument);
	const backgroundCanvas = {
		document: backgroundDocument,
		getRoot: () => backgroundRoot,
	};
	const mainCanvas = {
		document: mainDocument,
		getRoot: () => mainRoot,
	};
	const canvas = {
		document: mainDocument,
		getLayer: (layer = 'main') =>
			layer === 'background' ? backgroundCanvas : mainCanvas,
		getRoot: (layer = 'main') =>
			layer === 'background' ? backgroundRoot : mainRoot,
	};
	let zoom = 1;
	const elementPositions = new Map<string, [number, number]>();
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
	const updateZoomScale = vi.fn<(scale: number) => void>();
	const replaceSnapshot =
		vi.fn<(snapshot: G6LabelControllerSnapshot) => void>();
	const labelController = {
		updateLabels,
		updateZoomScale,
		replaceSnapshot,
	};
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
	const setElementState = vi.fn<
		(
			states: Record<string, readonly string[]>,
			animation: boolean,
		) => Promise<void>
	>(async () => undefined);
	const translateBy = vi.fn(async () => undefined);
	const translateElementTo = vi.fn(
		async (positions: Record<string, [number, number]>) => {
			for (const [id, position] of Object.entries(positions)) {
				elementPositions.set(id, [...position]);
			}
		},
	);
	const resize = vi.fn(() => {
		if (!nextCanvasCenter) return;
		canvasCenter = nextCanvasCenter;
		nextCanvasCenter = undefined;
	});
	const getCanvasByViewport = vi.fn(
		([x, y]: [number, number]) => [x + 10, y + 20] as [number, number],
	);
	const getViewportByCanvas = vi.fn(
		([x, y]: [number, number]) => [x - 10, y - 20] as [number, number],
	);
	const instance = {
		destroy,
		draw,
		focusElement,
		getCanvas: () => canvas,
		getCanvasCenter: () => canvasCenter,
		getCanvasByViewport,
		getElementPosition: (id: string) => elementPositions.get(id) ?? [0, 0],
		getPluginInstance: () => labelController,
		getViewportByCanvas,
		getZoom: () => zoom,
		off: vi.fn(),
		on: vi.fn((_event: string, listener: () => void) => {
			transformListener = listener;
		}),
		resize,
		setData,
		setElementState,
		setOptions,
		setZoomRange,
		translateBy,
		translateElementTo,
		updateData,
		zoomBy,
		zoomTo,
	} as unknown as G6GraphInstance;
	return {
		instance,
		backgroundRoot,
		destroy,
		draw,
		focusElement,
		getCanvasByViewport,
		getViewportByCanvas,
		setData,
		setElementState,
		setOptions,
		setZoomRange,
		translateBy,
		translateElementTo,
		updateData,
		updateLabels,
		updateZoomScale,
		replaceSnapshot,
		zoomBy,
		zoomTo,
		resizeCanvasTo: (center: [number, number]) => {
			nextCanvasCenter = center;
		},
		loadData: (data: G6GraphData) => {
			for (const node of data.nodes) {
				const x = Number(node.style.x);
				const y = Number(node.style.y);
				if (Number.isFinite(x) && Number.isFinite(y)) {
					elementPositions.set(node.id, [x, y]);
				}
			}
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

function readLastStateMap(
	setElementState: ReturnType<typeof createFakeG6>['setElementState'],
): Record<string, readonly string[]> {
	const states = setElementState.mock.calls.at(-1)?.[0];
	if (!states) throw new Error('Expected G6 element state patch');
	return states;
}
