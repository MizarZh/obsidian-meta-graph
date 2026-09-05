import { describe, expect, it, vi } from 'vitest';
import type { GraphEventCallbacks } from '../../../graph/renderers/renderer-events';
import type { GraphRenderer } from '../../../graph/renderers/renderer-adapter';
import type { PlanarRenderer } from '../../../graph/renderers/renderer-adapter';
import type { RendererEventBindings } from '../../../graph/renderers/renderer-events-adapter';
import type { D3ForceSimulation } from '../../../layouts/d3-force-simulation';
import { bindWorkspaceRendererEvents } from '../../../ui/workspace/renderer-events';

const rendererEventMock = vi.hoisted(() => ({
	callbacks: undefined as GraphEventCallbacks | undefined,
}));

vi.mock('../../../graph/renderers/renderer-events-adapter', () => ({
	bindRendererEvents: vi.fn(
		(renderer: GraphRenderer, bindings: RendererEventBindings) => {
			rendererEventMock.callbacks = bindings.planar(
				renderer as PlanarRenderer,
			);
			return vi.fn();
		},
	),
}));

vi.mock('../../../graph/renderers/renderer-adapter', () => ({
	getModeCapabilities: vi.fn((mode: string) => ({
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: mode === 'graph',
		supportsFreeNodeDrag: mode === 'free',
		supportsGroups: mode === 'free',
		supportsManualGroups: mode === 'free',
	})),
	isForceSimulationRenderer: vi.fn(() => true),
}));

describe('bindWorkspaceRendererEvents', () => {
	it('does not hold sigma bounds for graph force dragging', () => {
		const renderer = createPlanarRenderer();
		const simulation = {
			drag: vi.fn(),
		} as unknown as D3ForceSimulation;

		bindWorkspaceRendererEvents({
			...createOptions(renderer),
			mode: 'graph',
			enableForceLayout: true,
			getOrCreateForceLayoutSimulation: () => simulation,
		});

		rendererEventMock.callbacks?.onNodeDrag?.(
			'A',
			{ x: 1, y: 2 },
			{ x: 10, y: 20 },
		);

		expect(renderer.holdCurrentBounds).not.toHaveBeenCalled();
		expect(simulation.drag).toHaveBeenCalledWith(
			'A',
			{ x: 1, y: 2 },
			{ x: 10, y: 20 },
		);
		expect(renderer.refresh).not.toHaveBeenCalled();
	});

	it('keeps held bounds for manual free dragging', () => {
		const renderer = createPlanarRenderer();

		bindWorkspaceRendererEvents({
			...createOptions(renderer),
			mode: 'free',
			enableForceLayout: false,
		});

		rendererEventMock.callbacks?.onNodeDrag?.('A', { x: 1, y: 2 });

		expect(renderer.holdCurrentBounds).toHaveBeenCalledOnce();
		expect(renderer.runtimeGraph.mergeNodeAttributes).toHaveBeenCalledWith(
			'A',
			{ fixed: true },
		);
		expect(renderer.setNodePosition).toHaveBeenCalledWith('A', {
			x: 1,
			y: 2,
		});
		expect(renderer.refresh).not.toHaveBeenCalled();
	});

	it('keeps navigation callbacks but disables write gestures when read-only', () => {
		const renderer = createPlanarRenderer();
		const onConnect = vi.fn();
		const onSelect = vi.fn();
		const onSelectEdge = vi.fn();
		const onSelectGroup = vi.fn();
		const options = {
			...createOptions(renderer),
			onConnect,
			onSelect,
			onSelectEdge,
			onSelectGroup,
		};

		bindWorkspaceRendererEvents({
			...options,
			mode: 'free',
			readOnly: true,
			enableForceLayout: false,
		});

		rendererEventMock.callbacks?.onNodeDrag?.('A', { x: 1, y: 2 });
		rendererEventMock.callbacks?.onConnect?.('A', 'B');
		rendererEventMock.callbacks?.onSelect('A');
		rendererEventMock.callbacks?.onSelectEdge?.('edge-a');
		rendererEventMock.callbacks?.onSelectGroup?.('group-a');

		expect(renderer.holdCurrentBounds).not.toHaveBeenCalled();
		expect(onConnect).not.toHaveBeenCalled();
		expect(onSelect).toHaveBeenCalledWith('A');
		expect(onSelectEdge).toHaveBeenCalledWith('edge-a');
		expect(onSelectGroup).toHaveBeenCalledWith('group-a');
		expect(rendererEventMock.callbacks?.enableNodeDragging).toBe(false);
	});
});

function createOptions(
	renderer: PlanarRenderer,
): Parameters<typeof bindWorkspaceRendererEvents>[0] {
	return {
		renderer,
		mode: 'graph',
		enableForceLayout: false,
		getLayoutSnapshot: () => ({
			positions: new Map(),
			edgeIds: new Set(),
			orthogonalRoutes: new Map(),
			groupGeometries: [],
		}),
		getOrCreateForceLayoutSimulation: () =>
			({ drag: vi.fn() }) as unknown as D3ForceSimulation,
		getForceLayoutSimulation: () => undefined,
		getSuppressNodeOpenUntil: () => 0,
		setSuppressNodeOpenUntil: vi.fn(),
		getActiveNodeDropGroupId: () => undefined,
		setActiveNodeDropGroupId: vi.fn(),
		onSelect: vi.fn(),
		onSelectEdge: vi.fn(),
		onSelectGroup: vi.fn(),
		onHover: vi.fn(),
		onOpen: vi.fn(),
		onConnectionDrag: vi.fn(),
		onConnect: vi.fn(),
		onCommitManualNodePosition: vi.fn(),
	};
}

function createPlanarRenderer(): PlanarRenderer {
	return {
		runtimeGraph: {
			mergeNodeAttributes: vi.fn(),
		},
		graphToViewportPosition: vi.fn(() => ({ x: 10, y: 20 })),
		getNodePosition: vi.fn(() => ({ x: 1, y: 2 })),
		setNodePosition: vi.fn(),
		moveNodesBy: vi.fn(),
		refresh: vi.fn(),
		holdCurrentBounds: vi.fn(),
		getGroupAtViewportPosition: vi.fn(),
		setActiveDropGroup: vi.fn(),
	} as unknown as PlanarRenderer;
}
