import { describe, expect, it, vi } from 'vitest';
import type { GraphEventCallbacks } from '@/graph/renderers/renderer-events';
import { bindGraphEvents } from '@/graph/renderers/sigma/sigma-events';
import type { SigmaRenderer } from '@/graph/renderers/sigma/sigma-renderer';

describe('Sigma logical edge selection', () => {
	it.each([true, false])('bounds only force dragging (force=%s)', (force) => {
		class TestMouseEvent {
			button = 0;
			clientX = 50;
			clientY = 50;
			ctrlKey = false;
			metaKey = false;
			preventDefault = vi.fn();
		}
		vi.stubGlobal('MouseEvent', TestMouseEvent);
		try {
			const harness = createHarness();
			const onNodeDrag = vi.fn();
			bindGraphEvents(harness.renderer, {
				...createCallbacks(),
				enableForceLayout: force,
				enableNodeDragging: true,
				onNodeDrag,
			});
			harness.sigmaHandlers.get('downNode')!({
				node: 'node-a',
				event: {
					original: new TestMouseEvent(),
					preventSigmaDefault: vi.fn(),
				},
			});
			const move = harness.mouseHandlers.get('mousemovebody')!;
			move({ x: 1000, y: -100, preventSigmaDefault: vi.fn() });
			const expected = force ? { x: 188, y: 12 } : { x: 1000, y: -100 };
			expect(onNodeDrag).toHaveBeenLastCalledWith(
				'node-a',
				expected,
				expected,
			);
			move({ x: -100, y: 1000, preventSigmaDefault: vi.fn() });
			const opposite = force ? { x: 12, y: 88 } : { x: -100, y: 1000 };
			expect(onNodeDrag).toHaveBeenLastCalledWith(
				'node-a',
				opposite,
				opposite,
			);
			move({ x: 70, y: 60, preventSigmaDefault: vi.fn() });
			expect(onNodeDrag).toHaveBeenLastCalledWith(
				'node-a',
				{ x: 70, y: 60 },
				{ x: 70, y: 60 },
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('routes Canvas edges and groups before treating a stage click as blank', () => {
		const harness = createHarness();
		const callbacks = createCallbacks();
		bindGraphEvents(harness.renderer, callbacks);
		const clickStage = harness.sigmaHandlers.get('clickStage')!;

		harness.getCanvasEdge.mockReturnValueOnce('canvas-logical-edge');
		harness.getGroup.mockReturnValueOnce('group-under-edge');
		clickStage(stagePayload());
		expect(callbacks.onSelectEdge).toHaveBeenCalledWith(
			'canvas-logical-edge',
		);
		expect(callbacks.onSelectGroup).not.toHaveBeenCalled();

		harness.getCanvasEdge.mockReturnValue(undefined);
		harness.getGroup.mockReset().mockReturnValue('group-a');
		clickStage(stagePayload());
		expect(callbacks.onSelectGroup).toHaveBeenCalledWith('group-a');

		harness.getGroup.mockReturnValue(undefined);
		clickStage(stagePayload());
		expect(callbacks.onSelect).toHaveBeenCalledWith(undefined);
	});

	it('maps a picked Flow segment back to its logical edge', () => {
		const harness = createHarness();
		const callbacks = createCallbacks();
		bindGraphEvents(harness.renderer, callbacks);
		harness.getLogicalEdgeId.mockReturnValue('logical-edge');

		harness.sigmaHandlers.get('clickEdge')?.({
			edge: 'logical-edge__flow-segment__2',
			event: clickEvent(),
		});

		expect(harness.getLogicalEdgeId).toHaveBeenCalledWith(
			'logical-edge__flow-segment__2',
		);
		expect(callbacks.onSelectEdge).toHaveBeenCalledWith('logical-edge');
	});

	it('maps native edge enter and leave events to logical hover state', () => {
		const harness = createHarness();
		bindGraphEvents(harness.renderer, createCallbacks());
		harness.getLogicalEdgeId.mockReturnValue('logical-edge');

		harness.sigmaHandlers.get('enterEdge')?.({ edge: 'segment-1' });
		harness.sigmaHandlers.get('leaveEdge')?.({ edge: 'segment-1' });

		expect(harness.setHoveredEdge).toHaveBeenCalledWith('logical-edge');
		expect(harness.clearHoveredEdge).toHaveBeenCalledWith('logical-edge');
	});

	it('reuses Sigma hover events instead of picking nodes again on mouse move', () => {
		const harness = createHarness();
		bindGraphEvents(harness.renderer, createCallbacks());
		const moveBody = harness.mouseHandlers.get('mousemovebody')!;
		const moveEvent = { x: 20, y: 30, preventSigmaDefault: vi.fn() };

		harness.sigmaHandlers.get('enterNode')?.({ node: 'node-a' });
		moveBody(moveEvent);
		expect(harness.getNode).not.toHaveBeenCalled();
		expect(harness.getCanvasEdge).not.toHaveBeenCalled();
		expect(harness.getGroup).not.toHaveBeenCalled();
		expect(harness.setHoveredGroup).toHaveBeenLastCalledWith(undefined);

		harness.sigmaHandlers.get('leaveNode')?.({ node: 'node-a' });
		harness.getLogicalEdgeId.mockReturnValue('logical-edge');
		harness.sigmaHandlers.get('enterEdge')?.({ edge: 'segment-a' });
		moveBody(moveEvent);
		expect(harness.getCanvasEdge).not.toHaveBeenCalled();
		expect(harness.getGroup).not.toHaveBeenCalled();

		harness.sigmaHandlers.get('leaveEdge')?.({ edge: 'segment-a' });
		harness.getCanvasEdge.mockReturnValue('canvas-edge');
		moveBody(moveEvent);
		expect(harness.getGroup).not.toHaveBeenCalled();

		harness.getCanvasEdge.mockReturnValue(undefined);
		harness.getGroup.mockReturnValue('group-a');
		moveBody(moveEvent);
		expect(harness.setHoveredGroup).toHaveBeenLastCalledWith('group-a');
		expect(harness.getNode).not.toHaveBeenCalled();
	});

	it('routes right-click targets to context menus with selection priority', () => {
		const harness = createHarness();
		const callbacks = createCallbacks();
		bindGraphEvents(harness.renderer, callbacks);
		const original = {
			clientX: 20,
			clientY: 30,
			preventDefault: vi.fn(),
		} as unknown as MouseEvent;
		const event = {
			original,
			preventSigmaDefault: vi.fn(),
		};

		harness.getLogicalEdgeId.mockReturnValue('logical-edge');
		harness.sigmaHandlers.get('rightClickEdge')?.({
			edge: 'flow-segment',
			event,
		});
		expect(callbacks.onSelectEdge).toHaveBeenCalledWith('logical-edge');
		expect(callbacks.onContextMenu).toHaveBeenCalledWith(
			{ kind: 'edge', edgeId: 'logical-edge' },
			original,
		);

		harness.getCanvasEdge.mockReturnValue('canvas-edge');
		harness.sigmaHandlers.get('rightClickStage')?.({
			event: { ...event, x: 20, y: 30 },
		});
		expect(callbacks.onContextMenu).toHaveBeenLastCalledWith(
			{ kind: 'edge', edgeId: 'canvas-edge' },
			original,
		);

		harness.getCanvasEdge.mockReturnValue(undefined);
		harness.getGroup.mockReturnValue('group-a');
		harness.sigmaHandlers.get('rightClickStage')?.({
			event: { ...event, x: 20, y: 30 },
		});
		expect(callbacks.onContextMenu).toHaveBeenLastCalledWith(
			{ kind: 'group', groupId: 'group-a' },
			original,
		);

		harness.getGroup.mockReturnValue(undefined);
		harness.sigmaHandlers.get('rightClickStage')?.({
			event: { ...event, x: 20, y: 30 },
		});
		expect(callbacks.onContextMenu).toHaveBeenLastCalledWith(
			{ kind: 'stage' },
			original,
		);
	});
});

function createCallbacks(): GraphEventCallbacks & {
	onSelect: ReturnType<typeof vi.fn>;
	onSelectEdge: ReturnType<typeof vi.fn>;
	onSelectGroup: ReturnType<typeof vi.fn>;
	onContextMenu: ReturnType<typeof vi.fn>;
} {
	return {
		onSelect: vi.fn(),
		onSelectEdge: vi.fn(),
		onSelectGroup: vi.fn(),
		onContextMenu: vi.fn(),
		onHover: vi.fn(),
		onOpen: vi.fn(),
	};
}

function createHarness() {
	const sigmaHandlers = new Map<string, (payload: unknown) => void>();
	const mouseHandlers = new Map<string, (payload: unknown) => void>();
	const getCanvasEdge =
		vi.fn<(position: { x: number; y: number }) => string | undefined>();
	const getGroup =
		vi.fn<(position: { x: number; y: number }) => string | undefined>();
	const getLogicalEdgeId =
		vi.fn<(runtimeEdgeId: string) => string | undefined>();
	const getNode =
		vi.fn<(position: { x: number; y: number }) => string | undefined>();
	const setHoveredEdge = vi.fn<(edgeId: string) => void>();
	const clearHoveredEdge = vi.fn<(edgeId: string) => void>();
	const setHoveredGroup = vi.fn<(groupId?: string) => void>();
	const sigma = {
		on: vi.fn((name: string, handler: (payload: unknown) => void) => {
			sigmaHandlers.set(name, handler);
		}),
		off: vi.fn(),
		getMouseCaptor: () => ({
			on: vi.fn((name: string, handler: (payload: unknown) => void) => {
				mouseHandlers.set(name, handler);
			}),
			off: vi.fn(),
		}),
		getGraph: () => ({
			getNodeAttribute: vi.fn((_id: string, key: string) =>
				key === 'size' ? 8 : false,
			),
			getNodeAttributes: () => ({ x: 50, y: 50 }),
		}),
		getDimensions: () => ({ width: 200, height: 100 }),
		scaleSize: (size: number) => size,
		getContainer: () => ({
			getBoundingClientRect: () => ({ left: 0, top: 0 }),
		}),
		getSetting: vi.fn(),
		setSetting: vi.fn(),
		viewportToGraph: vi.fn((point) => point),
		graphToViewport: vi.fn((point) => point),
	};
	const renderer = {
		instance: sigma,
		getNodeAtViewportPosition: getNode,
		getEdgeAtViewportPosition: getCanvasEdge,
		getGroupAtViewportPosition: getGroup,
		getLogicalEdgeId,
		setHoveredEdge,
		clearHoveredEdge,
		setHoveredGroup,
		clearPinnedHover: vi.fn(),
		togglePinnedHover: vi.fn(),
	} as unknown as SigmaRenderer;
	return {
		renderer,
		sigmaHandlers,
		getCanvasEdge,
		getGroup,
		getLogicalEdgeId,
		getNode,
		setHoveredEdge,
		clearHoveredEdge,
		setHoveredGroup,
		mouseHandlers,
	};
}

function stagePayload() {
	return {
		event: {
			x: 20,
			y: 30,
			...clickEvent(),
		},
	} as never;
}

function clickEvent() {
	return {
		original: { preventDefault: vi.fn() },
		preventSigmaDefault: vi.fn(),
	};
}
