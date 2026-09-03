import { describe, expect, it, vi } from 'vitest';
import type { GraphEventCallbacks } from '../graph/renderers/renderer-events';
import { bindGraphEvents } from '../graph/renderers/sigma/sigma-events';
import type { SigmaRenderer } from '../graph/renderers/sigma/sigma-renderer';

describe('Sigma logical edge selection', () => {
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
	const getCanvasEdge = vi.fn<
		(position: { x: number; y: number }) => string | undefined
	>();
	const getGroup = vi.fn<
		(position: { x: number; y: number }) => string | undefined
	>();
	const getLogicalEdgeId = vi.fn<
		(runtimeEdgeId: string) => string | undefined
	>();
	const setHoveredEdge = vi.fn<(edgeId: string) => void>();
	const clearHoveredEdge = vi.fn<(edgeId: string) => void>();
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
		getGraph: () => ({ getNodeAttribute: vi.fn() }),
		getSetting: vi.fn(),
		setSetting: vi.fn(),
		viewportToGraph: vi.fn(),
		graphToViewport: vi.fn(),
	};
	const renderer = {
		instance: sigma,
		getEdgeAtViewportPosition: getCanvasEdge,
		getGroupAtViewportPosition: getGroup,
		getLogicalEdgeId,
		setHoveredEdge,
		clearHoveredEdge,
		clearPinnedHover: vi.fn(),
		togglePinnedHover: vi.fn(),
	} as unknown as SigmaRenderer;
	return {
		renderer,
		sigmaHandlers,
		getCanvasEdge,
		getGroup,
		getLogicalEdgeId,
		setHoveredEdge,
		clearHoveredEdge,
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
