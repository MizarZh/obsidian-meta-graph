import { describe, expect, it, vi } from 'vitest';
import type { GraphEventCallbacks } from '../graph/renderers/renderer-events';
import type { GraphRenderer } from '../graph/renderers/renderer-adapter';
import type { SigmaRenderer } from '../graph/renderers/sigma/sigma-renderer';
import type { D3ForceSimulation } from '../layouts/d3-force-simulation';
import { bindWorkspaceRendererEvents } from '../ui/workspace/renderer-events';

const rendererEventMock = vi.hoisted(() => ({
	callbacks: undefined as GraphEventCallbacks | undefined,
}));

vi.mock('../graph/renderers/renderer-events-adapter', () => ({
	bindRendererEvents: vi.fn((renderer: GraphRenderer, bindings) => {
		rendererEventMock.callbacks = bindings.sigma(renderer as SigmaRenderer);
		return vi.fn();
	}),
}));

vi.mock('../graph/renderers/renderer-adapter', () => ({
	getModeCapabilities: vi.fn((mode: string) => ({
		rendererKind: 'sigma',
		usesSigmaForceSimulation: mode === 'graph',
		supportsFreeNodeDrag: mode === 'free',
		supportsManualGroups: mode === 'free',
	})),
}));

describe('bindWorkspaceRendererEvents', () => {
	it('does not hold sigma bounds for graph force dragging', () => {
		const renderer = createSigmaRenderer();
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
	});

	it('keeps held bounds for manual free dragging', () => {
		const renderer = createSigmaRenderer();

		bindWorkspaceRendererEvents({
			...createOptions(renderer),
			mode: 'free',
			enableForceLayout: false,
		});

		rendererEventMock.callbacks?.onNodeDrag?.('A', { x: 1, y: 2 });

		expect(renderer.holdCurrentBounds).toHaveBeenCalledOnce();
		expect(renderer.runtimeGraph.mergeNodeAttributes).toHaveBeenCalledWith(
			'A',
			{ x: 1, y: 2, fixed: true },
		);
	});
});

function createOptions(
	renderer: SigmaRenderer,
): Parameters<typeof bindWorkspaceRendererEvents>[0] {
	return {
		renderer,
		mode: 'graph',
		enableForceLayout: false,
		getLayoutSnapshot: () => ({
			positions: new Map(),
			edgeIds: new Set(),
			orthogonalRoutes: new Map(),
		}),
		getOrCreateForceLayoutSimulation: () =>
			({ drag: vi.fn() }) as unknown as D3ForceSimulation,
		getForceLayoutSimulation: () => undefined,
		getSuppressNodeOpenUntil: () => 0,
		setSuppressNodeOpenUntil: vi.fn(),
		getActiveNodeDropGroupId: () => undefined,
		setActiveNodeDropGroupId: vi.fn(),
		onSelect: vi.fn(),
		onHover: vi.fn(),
		onOpen: vi.fn(),
		onConnectionDrag: vi.fn(),
		onConnect: vi.fn(),
		onCommitManualNodePosition: vi.fn(),
	};
}

function createSigmaRenderer(): SigmaRenderer {
	return {
		runtimeGraph: {
			mergeNodeAttributes: vi.fn(),
		},
		instance: {
			refresh: vi.fn(),
			graphToViewport: vi.fn(() => ({ x: 10, y: 20 })),
		},
		holdCurrentBounds: vi.fn(),
		getGroupAtViewportPosition: vi.fn(),
		setActiveDropGroup: vi.fn(),
	} as unknown as SigmaRenderer;
}
