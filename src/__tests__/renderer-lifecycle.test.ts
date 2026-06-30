import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../core/types';
import type { GraphRenderer } from '../graph/renderers/renderer-adapter';
import type { LayoutSnapshot } from '../layouts/stable-layout';
import { WorkspaceRendererLifecycle } from '../ui/workspace/renderer-lifecycle';
import { createWorkspaceState } from '../workspace/workspace-state';
import { createWorkspaceRuntimeGraph } from '../ui/workspace/runtime-graph';
import { createWorkspaceGraphRenderer } from '../ui/workspace/renderer-factory';

vi.mock('../graph/renderers/renderer-adapter', () => ({
	getModeCapabilities: vi.fn(() => ({
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	})),
	getRendererKind: vi.fn(() => 'sigma'),
	getRendererKindForMode: vi.fn(() => 'sigma'),
	isCube3DRenderer: vi.fn(() => false),
	isForce3DRenderer: vi.fn(() => false),
	setRendererManualLayout: vi.fn(),
	setRendererPalette: vi.fn(),
}));

vi.mock('../graph/styles/graph-styles', () => ({
	readGraphPalette: vi.fn(() => ({
		node: '#ffffff',
		nodeBorder: '#000000',
		edge: '#999999',
		text: '#111111',
		accent: '#ff0000',
	})),
}));

vi.mock('../graph/model/runtime-graph-debug', () => ({
	serializeRuntimeGraph: vi.fn(() => ({
		nodeCount: 1,
		edgeCount: 0,
		nodes: [],
		edges: [],
	})),
}));

vi.mock('../layouts/stable-layout', () => ({
	hydrateManualLayoutPositions: vi.fn(),
	applyStableLayout: vi.fn(async () => undefined),
}));

vi.mock('../ui/workspace/runtime-graph', () => ({
	createWorkspaceRuntimeGraph: vi.fn(),
}));

vi.mock('../ui/workspace/renderer-factory', () => ({
	createWorkspaceGraphRenderer: vi.fn(),
}));

function createRenderer(): GraphRenderer {
	return {
		runtimeGraph: {},
		instance: { refresh: vi.fn() },
		setGraph: vi.fn(),
		setSelected: vi.fn(),
		setHovered: vi.fn(),
		fit: vi.fn(),
		kill: vi.fn(),
		resize: vi.fn(),
		focusNode: vi.fn(),
		clearHeldBounds: vi.fn(),
	} as unknown as GraphRenderer;
}

function createState(): WorkspaceState {
	return {
		...createWorkspaceState(100),
		projection: {
			nodes: [
				{
					id: 'a',
					path: 'a.md',
					title: 'A',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [],
			rootIds: new Set<string>(),
		},
	};
}

function createLayoutSnapshot(): LayoutSnapshot {
	return {
		positions: new Map(),
		edgeIds: new Set(),
		orthogonalRoutes: new Map(),
	};
}

describe('WorkspaceRendererLifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(createWorkspaceRuntimeGraph).mockReturnValue({
			nodes: () => ['a'],
		} as never);
	});

	it('creates a renderer, binds events, and publishes rendered debug state', async () => {
		const state = createState();
		const renderer = createRenderer();
		const unbind = vi.fn();
		const setRendererDebugState = vi.fn();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);

		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () =>
				({
					getBoundingClientRect: () => ({ width: 800, height: 600 }),
				}) as HTMLDivElement,
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => unbind,
			syncRendererGroups: vi.fn(),
			setRendererDebugState,
		});

		await lifecycle.rebuild();

		expect(lifecycle.renderer).toBe(renderer);
		expect(createWorkspaceGraphRenderer).toHaveBeenCalledOnce();
		expect(renderer.setSelected).toHaveBeenCalledWith(undefined);
		expect(renderer.setHovered).toHaveBeenCalledWith(undefined);
		expect(renderer.fit).toHaveBeenCalledOnce();
		expect(setRendererDebugState).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: 'rendered' }),
		);
	});

	it('unbinds events and kills the renderer on dispose', async () => {
		const state = createState();
		const renderer = createRenderer();
		const unbind = vi.fn();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => ({}) as HTMLDivElement,
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => unbind,
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();
		lifecycle.dispose();

		expect(unbind).toHaveBeenCalledOnce();
		expect(renderer.clearHeldBounds).toHaveBeenCalledOnce();
		expect(renderer.kill).toHaveBeenCalledOnce();
		expect(lifecycle.renderer).toBeUndefined();
	});
});
