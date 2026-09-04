import {
	CanvasEvent,
	CommonEvent,
	EdgeEvent,
	NodeEvent,
	type IElementEvent,
	type IPointerEvent,
} from '@antv/g6';
import Graphology from 'graphology';
import { describe, expect, it, vi } from 'vitest';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../../graph/model/graphology-adapter';
import { bindG6Events } from '../../../graph/renderers/g6/g6-events';
import type { G6Renderer } from '../../../graph/renderers/g6/g6-renderer';
import type { GraphEventCallbacks } from '../../../graph/renderers/renderer-events';

describe('G6 events', () => {
	it('handles selection, hover, context menus, and canonical connection drag', () => {
		const graph = createGraph();
		const emitter = createEmitter();
		const togglePinnedHover = vi.fn();
		const clearPinnedHover = vi.fn();
		const setHoveredEdge = vi.fn();
		const setHoveredGroup = vi.fn();
		const renderer = {
			instance: emitter.instance,
			container: {} as HTMLElement,
			runtimeGraph: graph,
			graphToViewportPosition: ({ x, y }: { x: number; y: number }) => ({
				x: x + 100,
				y: y + 200,
			}),
			getLogicalEdgeId: (edgeId: string) =>
				graph.getEdgeAttribute(edgeId, 'logicalEdgeId') ?? edgeId,
			togglePinnedHover,
			clearPinnedHover,
			setHoveredEdge,
			setHoveredGroup,
			getGroupAtViewportPosition: vi.fn(() => undefined),
		} as unknown as G6Renderer;
		const callbackHarness = createCallbacks();
		const unbind = bindG6Events(renderer, callbackHarness.callbacks);

		emitter.emit(NodeEvent.CLICK, elementEvent('A'));
		emitter.emit(NodeEvent.CLICK, elementEvent('A', { shiftKey: true }));
		emitter.emit(NodeEvent.POINTER_ENTER, elementEvent('A'));
		emitter.emit(NodeEvent.POINTER_LEAVE, elementEvent('A'));
		emitter.emit(EdgeEvent.CLICK, elementEvent('runtime-edge', {}, 'edge'));
		emitter.emit(
			EdgeEvent.POINTER_ENTER,
			elementEvent('runtime-edge', {}, 'edge'),
		);
		emitter.emit(
			EdgeEvent.POINTER_LEAVE,
			elementEvent('runtime-edge', {}, 'edge'),
		);

		expect(callbackHarness.onSelect).toHaveBeenCalledWith('A');
		expect(togglePinnedHover).toHaveBeenCalledWith('A');
		expect(callbackHarness.onHover).toHaveBeenNthCalledWith(1, 'A');
		expect(callbackHarness.onHover).toHaveBeenNthCalledWith(2, undefined);
		expect(clearPinnedHover).toHaveBeenCalledOnce();
		expect(callbackHarness.onSelectEdge).toHaveBeenCalledWith(
			'logical-edge',
		);
		expect(setHoveredEdge).toHaveBeenNthCalledWith(1, 'logical-edge');
		expect(setHoveredEdge).toHaveBeenNthCalledWith(2, undefined);

		emitter.emit(NodeEvent.CONTEXT_MENU, elementEvent('A'));
		emitter.emit(
			EdgeEvent.CONTEXT_MENU,
			elementEvent('runtime-edge', {}, 'edge'),
		);
		emitter.emit(CanvasEvent.CONTEXT_MENU, pointerEvent('canvas'));
		expect(callbackHarness.onContextMenu).toHaveBeenNthCalledWith(
			1,
			{ kind: 'node', nodeId: 'A' },
			expect.anything(),
		);
		expect(callbackHarness.onContextMenu).toHaveBeenNthCalledWith(
			2,
			{ kind: 'edge', edgeId: 'logical-edge' },
			expect.anything(),
		);
		expect(callbackHarness.onContextMenu).toHaveBeenNthCalledWith(
			3,
			{ kind: 'stage' },
			expect.anything(),
		);

		emitter.emit(
			NodeEvent.POINTER_DOWN,
			elementEvent('A', { ctrlKey: true, button: 0 }),
		);
		emitter.emit(
			CommonEvent.POINTER_MOVE,
			elementEvent('B', {
				viewport: { x: 40, y: 50 } as IPointerEvent['viewport'],
			}),
		);
		emitter.emit(CommonEvent.POINTER_UP, elementEvent('B'));
		expect(callbackHarness.onConnectionDrag).toHaveBeenNthCalledWith(1, {
			sourceNodeId: 'A',
			x1: 110,
			y1: 220,
			x2: 110,
			y2: 220,
		});
		expect(callbackHarness.onConnectionDrag).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ targetNodeId: 'B', x2: 40, y2: 50 }),
		);
		expect(callbackHarness.onConnectionDrag).toHaveBeenLastCalledWith(
			undefined,
		);
		expect(callbackHarness.onConnect).toHaveBeenCalledWith('A', 'B');

		unbind();
		expect(emitter.listenerCount()).toBe(0);
	});

	it('routes canvas selection, hover, and context menu to groups', () => {
		const emitter = createEmitter();
		const renderer = createRenderer(createGraph(), emitter.instance);
		const setHoveredGroup = vi.fn();
		renderer.setHoveredGroup = setHoveredGroup;
		const groupHit = vi
			.spyOn(renderer, 'getGroupAtViewportPosition')
			.mockReturnValue('group-a');
		const callbackHarness = createCallbacks();
		bindG6Events(renderer, callbackHarness.callbacks);

		emitter.emit(CommonEvent.POINTER_MOVE, pointerEvent('canvas'));
		emitter.emit(CanvasEvent.CLICK, pointerEvent('canvas'));
		emitter.emit(CanvasEvent.CONTEXT_MENU, pointerEvent('canvas'));

		expect(groupHit).toHaveBeenCalledWith({ x: 12, y: 24 });
		expect(setHoveredGroup).toHaveBeenCalledWith('group-a');
		expect(callbackHarness.onSelectGroup).toHaveBeenCalledWith('group-a');
		expect(callbackHarness.onContextMenu).toHaveBeenCalledWith(
			{ kind: 'group', groupId: 'group-a' },
			expect.anything(),
		);
		expect(callbackHarness.onSelect).not.toHaveBeenCalledWith(undefined);
	});

	it('opens on double click and clears selection on canvas click', () => {
		const emitter = createEmitter();
		const renderer = createRenderer(createGraph(), emitter.instance);
		const callbackHarness = createCallbacks();
		bindG6Events(renderer, callbackHarness.callbacks);

		emitter.emit(NodeEvent.DBLCLICK, elementEvent('A'));
		emitter.emit(CanvasEvent.CLICK, pointerEvent('canvas'));

		expect(callbackHarness.onOpen).toHaveBeenCalledWith('A');
		expect(callbackHarness.onSelect).toHaveBeenLastCalledWith(undefined);
	});

	it('suppresses hover work while dragging the canvas', () => {
		const emitter = createEmitter();
		const renderer = createRenderer(createGraph(), emitter.instance);
		const setHoveredGroup = vi.fn();
		renderer.setHoveredGroup = setHoveredGroup;
		const callbackHarness = createCallbacks();
		bindG6Events(renderer, callbackHarness.callbacks);

		emitter.emit(CommonEvent.DRAG_START, pointerEvent('canvas'));
		emitter.emit(NodeEvent.POINTER_ENTER, elementEvent('A'));
		emitter.emit(CommonEvent.POINTER_MOVE, pointerEvent('canvas'));
		expect(callbackHarness.onHover).not.toHaveBeenCalled();
		expect(setHoveredGroup).not.toHaveBeenCalled();

		emitter.emit(CommonEvent.DRAG_END, pointerEvent('canvas'));
		expect(callbackHarness.onHover).toHaveBeenCalledOnce();
		expect(callbackHarness.onHover).toHaveBeenCalledWith(undefined);
	});
});

function createGraph(): RuntimeGraph {
	const graph = new Graphology<
		RuntimeNodeAttributes,
		RuntimeEdgeAttributes,
		Record<string, never>
	>({ multi: true, type: 'mixed' });
	for (const [id, x] of [
		['A', 10],
		['B', 30],
	] as const) {
		graph.addNode(id, {
			label: id,
			x,
			y: 20,
			size: 8,
			color: '#123456',
			path: id,
			folder: '',
			domains: [],
			tags: [],
		});
	}
	graph.addDirectedEdgeWithKey('runtime-edge', 'A', 'B', {
		relation: 'leads-to',
		type: 'arrow',
		size: 1,
		color: '#654321',
		hidden: false,
		label: '',
		forceLabel: false,
		lineStyle: 'solid',
		logicalEdgeId: 'logical-edge',
	});
	return graph;
}

function createRenderer(
	runtimeGraph: RuntimeGraph,
	instance: ReturnType<typeof createEmitter>['instance'],
): G6Renderer {
	return {
		instance,
		container: {} as HTMLElement,
		runtimeGraph,
		graphToViewportPosition: ({ x, y }: { x: number; y: number }) => ({
			x,
			y,
		}),
		getLogicalEdgeId: (edgeId: string) => edgeId,
		togglePinnedHover: vi.fn(),
		clearPinnedHover: vi.fn(),
		setHoveredEdge: vi.fn(),
		setHoveredGroup: vi.fn(),
		getGroupAtViewportPosition: vi.fn(() => undefined),
	} as unknown as G6Renderer;
}

function createCallbacks() {
	const onSelect = vi.fn();
	const onSelectEdge = vi.fn();
	const onSelectGroup = vi.fn();
	const onHover = vi.fn();
	const onOpen = vi.fn();
	const onContextMenu = vi.fn();
	const onNodeDrag = vi.fn();
	const onNodeDragEnd = vi.fn();
	const onConnectionDrag = vi.fn();
	const onConnect = vi.fn();
	const callbacks: GraphEventCallbacks = {
		onSelect,
		onSelectEdge,
		onSelectGroup,
		onHover,
		onOpen,
		onContextMenu,
		onNodeDrag,
		onNodeDragEnd,
		onConnectionDrag,
		onConnect,
	};
	return {
		callbacks,
		onSelect,
		onSelectEdge,
		onSelectGroup,
		onHover,
		onOpen,
		onContextMenu,
		onNodeDrag,
		onNodeDragEnd,
		onConnectionDrag,
		onConnect,
	};
}

function createEmitter() {
	const listeners = new Map<string, Set<(event: IPointerEvent) => void>>();
	const instance = {
		on: (name: string, listener: (event: IPointerEvent) => void) => {
			const group = listeners.get(name) ?? new Set();
			group.add(listener);
			listeners.set(name, group);
		},
		off: (name: string, listener: (event: IPointerEvent) => void) => {
			listeners.get(name)?.delete(listener);
		},
	} as unknown as G6Renderer['instance'];
	return {
		instance,
		emit: (name: string, event: IPointerEvent) =>
			listeners.get(name)?.forEach((listener) => listener(event)),
		listenerCount: () =>
			[...listeners.values()].reduce(
				(count, group) => count + group.size,
				0,
			),
	};
}

function elementEvent(
	id: string,
	overrides: Partial<IPointerEvent> = {},
	targetType: 'node' | 'edge' = 'node',
): IElementEvent {
	return pointerEvent(targetType, {
		...overrides,
		target: { id } as IElementEvent['target'],
	}) as IElementEvent;
}

function pointerEvent(
	targetType: IPointerEvent['targetType'],
	overrides: Partial<IPointerEvent> = {},
): IPointerEvent {
	return {
		targetType,
		target: {},
		button: 0,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		viewport: { x: 12, y: 24 },
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		nativeEvent: {
			clientX: 12,
			clientY: 24,
			preventDefault: vi.fn(),
		},
		...overrides,
	} as unknown as IPointerEvent;
}
