import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '@/core/types';
import {
	getModeCapabilities,
	getRendererKind,
	getRendererKindForMode,
	type GraphRenderer,
} from '@/graph/renderers/renderer-adapter';
import {
	applyStableLayout,
	type LayoutSnapshot,
} from '@/layouts/stable-layout';
import { D3ForceSimulation } from '@/layouts/d3-force-simulation';
import { serializeRuntimeGraph } from '@/graph/model/runtime-graph-debug';
import { WorkspaceRendererLifecycle } from '@/ui/workspace/renderer-lifecycle';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { createWorkspaceRuntimeGraph } from '@/ui/workspace/runtime-graph';
import { createWorkspaceGraphRenderer } from '@/ui/workspace/renderer-factory';

vi.mock('@/graph/renderers/renderer-adapter', () => ({
	getModeCapabilities: vi.fn(() => ({
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: false,
		supportsManualGroups: false,
	})),
	getRendererKind: vi.fn(() => 'sigma'),
	getRendererKindForMode: vi.fn(() => 'sigma'),
	getRendererCapabilities: vi.fn(() => ({
		kind: 'sigma',
		supportsGroupOverlay: true,
		supportsLayoutGroupGeometry: true,
		supportsManualLayout: false,
		supportsEdgePicking: true,
		supportsNodeDragging: true,
		supportsConnectionMoveScheduling: false,
		supportsExternal2DForceSimulation: true,
	})),
	isCube3DRenderer: vi.fn(() => false),
	isForce3DRenderer: vi.fn(() => false),
	isForceSimulationRenderer: vi.fn(() => true),
	isPlanarRenderer: vi.fn(() => true),
	setRendererManualLayout: vi.fn(),
	setRendererPalette: vi.fn(),
}));

vi.mock('@/graph/styles/graph-styles', () => ({
	readGraphPalette: vi.fn(() => ({
		node: '#ffffff',
		nodeBorder: '#000000',
		edge: '#999999',
		text: '#111111',
		accent: '#ff0000',
	})),
}));

vi.mock('@/graph/model/runtime-graph-debug', () => ({
	serializeRuntimeGraph: vi.fn(() => ({
		nodeCount: 1,
		edgeCount: 0,
		nodes: [],
		edges: [],
	})),
}));

vi.mock('@/layouts/stable-layout', () => ({
	hydrateManualLayoutPositions: vi.fn(),
	applyStableLayout: vi.fn(async () => undefined),
}));

vi.mock('@/layouts/d3-force-simulation', () => ({
	D3ForceSimulation: vi.fn(() => ({
		start: vi.fn(),
		stop: vi.fn(),
	})),
}));

vi.mock('@/ui/workspace/runtime-graph', () => ({
	createWorkspaceRuntimeGraph: vi.fn(),
	prepareWorkspaceRuntimeGraphVisibilityIndex: vi.fn(),
}));

vi.mock('@/ui/workspace/renderer-factory', () => ({
	createWorkspaceGraphRenderer: vi.fn(),
}));

function createRenderer(): GraphRenderer {
	return {
		runtimeGraph: { hasNode: vi.fn(() => true) },
		instance: { refresh: vi.fn() },
		setGraph: vi.fn(),
		setSelected: vi.fn(),
		setSelectedEdge: vi.fn(),
		setSelectedGroup: vi.fn(),
		setHovered: vi.fn(),
		fit: vi.fn(),
		zoomBy: vi.fn(),
		getZoomLevel: vi.fn(() => 100),
		setZoomLevel: vi.fn(),
		onZoomLevelChange: vi.fn(() => vi.fn()),
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
		groupGeometries: [],
	};
}

function createTestCanvas(): HTMLDivElement {
	const children: Array<
		HTMLDivElement & { remove: ReturnType<typeof vi.fn> }
	> = [];
	const container = {
		children,
		style: { position: '' },
		getBoundingClientRect: () => ({ width: 800, height: 600 }),
		ownerDocument: {
			createElement: () => {
				const host = {
					className: '',
					isConnected: false,
					style: {},
					remove: vi.fn(() => {
						const index = children.indexOf(host as never);
						if (index >= 0) children.splice(index, 1);
						host.isConnected = false;
					}),
				};
				return host;
			},
		},
		appendChild: vi.fn((host: HTMLDivElement) => {
			children.push(host as never);
			(host as unknown as { isConnected: boolean }).isConnected = true;
			return host;
		}),
	};
	return container as unknown as HTMLDivElement;
}

describe('WorkspaceRendererLifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getModeCapabilities).mockReturnValue({
			rendererKind: 'sigma',
			usesExternal2DForceSimulation: false,
			supportsFreeNodeDrag: false,
			supportsGroups: false,
			supportsManualGroups: false,
		});
		vi.mocked(createWorkspaceRuntimeGraph).mockReturnValue({
			nodes: () => ['a'],
		} as never);
		vi.mocked(applyStableLayout).mockResolvedValue(undefined);
	});

	it('zooms current renderer in and out with fixed steps', async () => {
		const renderer = createRenderer();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: createState,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();
		lifecycle.zoomIn();
		lifecycle.zoomOut();
		lifecycle.setZoomLevel(175);

		expect(renderer.zoomBy).toHaveBeenNthCalledWith(1, 1.1);
		expect(renderer.zoomBy).toHaveBeenNthCalledWith(2, 0.9);
		expect(renderer.setZoomLevel).toHaveBeenCalledWith(175);
	});

	it('creates a renderer, binds events, and publishes rendered debug state', async () => {
		const state = createState();
		const renderer = createRenderer();
		const unbind = vi.fn();
		const setRendererDebugState = vi.fn();
		const setRenderPending = vi.fn();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);

		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => unbind,
			syncRendererGroups: vi.fn(),
			setRendererDebugState,
			setRenderPending,
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
		expect(setRenderPending.mock.calls).toEqual([[true], [false]]);
	});

	it('keeps a reused renderer live across same-kind rebuilds', async () => {
		const renderer = createRenderer();
		let rendererIsStale: (() => boolean) | undefined;
		vi.mocked(createWorkspaceGraphRenderer).mockImplementation(
			async (options) => {
				rendererIsStale = options.isStale;
				return renderer;
			},
		);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: createState,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();
		expect(rendererIsStale?.()).toBe(false);

		await lifecycle.rebuild();
		expect(createWorkspaceGraphRenderer).toHaveBeenCalledOnce();
		expect(renderer.setGraph).toHaveBeenCalledOnce();
		expect(rendererIsStale?.()).toBe(false);

		lifecycle.dispose();
		expect(rendererIsStale?.()).toBe(true);
	});

	it('recreates G6 when the planar view mode changes', async () => {
		let state: WorkspaceState = {
			...createState(),
			mode: 'graph',
			renderer: 'g6',
		};
		const canvas = createTestCanvas();
		const graphRenderer = createRenderer();
		const arcRenderer = createRenderer();
		vi.mocked(getRendererKindForMode).mockReturnValue('g6');
		vi.mocked(getRendererKind).mockReturnValue('g6');
		vi.mocked(createWorkspaceGraphRenderer)
			.mockResolvedValueOnce(graphRenderer)
			.mockResolvedValueOnce(arcRenderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => canvas,
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();
		const firstHost = vi.mocked(createWorkspaceGraphRenderer).mock
			.calls[0]?.[0].container;
		state = { ...state, mode: 'arc' };
		await lifecycle.rebuild();

		expect(graphRenderer.kill).toHaveBeenCalledOnce();
		expect(graphRenderer.setGraph).not.toHaveBeenCalled();
		expect(firstHost?.isConnected).toBe(false);
		expect(createWorkspaceGraphRenderer).toHaveBeenCalledTimes(2);
		expect(lifecycle.renderer).toBe(arcRenderer);
	});

	it('skips runtime diagnostics until explicitly requested', async () => {
		const renderer = createRenderer();
		const setRendererDebugState = vi.fn();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: createState,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState,
			shouldCaptureRuntimeDebug: () => false,
		});

		await lifecycle.rebuild();

		expect(setRendererDebugState).not.toHaveBeenCalled();
		expect(serializeRuntimeGraph).not.toHaveBeenCalled();

		lifecycle.publishDebugState();
		expect(serializeRuntimeGraph).toHaveBeenCalledOnce();
		expect(setRendererDebugState).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'rendered' }),
		);
	});

	it('restores ephemeral hover without reading workspace hover state', async () => {
		const state = { ...createState(), hoveredNodeId: 'workspace-hover' };
		let ephemeralHover: string | undefined = 'ephemeral-hover';
		const renderer = createRenderer();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
			readHoveredNodeId: () => ephemeralHover,
		});
		vi.mocked(createWorkspaceRuntimeGraph).mockReturnValue({
			order: 1,
			size: 0,
			nodes: () => ['a'],
			hasNode: (nodeId: string) => nodeId === 'ephemeral-hover',
		} as never);

		await lifecycle.rebuild();

		expect(renderer.setHovered).toHaveBeenLastCalledWith('ephemeral-hover');

		ephemeralHover = undefined;
		await lifecycle.rebuild();

		expect(renderer.setHovered).toHaveBeenLastCalledWith(undefined);
	});

	it('clears loading state when rendering fails', async () => {
		const state = createState();
		const setRenderPending = vi.fn();
		vi.mocked(applyStableLayout).mockRejectedValueOnce(
			new Error('Layout failed'),
		);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
			setRenderPending,
		});

		await expect(lifecycle.rebuild()).rejects.toThrow('Layout failed');
		expect(setRenderPending.mock.calls).toEqual([[true], [false]]);
	});

	it('does not start sigma force layout automatically after render', async () => {
		vi.mocked(getModeCapabilities).mockReturnValue({
			rendererKind: 'sigma',
			usesExternal2DForceSimulation: true,
			supportsFreeNodeDrag: false,
			supportsGroups: false,
			supportsManualGroups: false,
		});
		const state = { ...createState(), enableForceLayout: true };
		const renderer = createRenderer();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);

		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();

		expect(D3ForceSimulation).not.toHaveBeenCalled();
	});

	it('starts group force dragging from displayed positions only when enabled', async () => {
		const state = { ...createState(), enableForceLayout: true };
		const renderer = createRenderer();
		Object.assign(renderer, {
			getNodePosition: vi.fn((id: string) =>
				id === 'a' ? { x: 12, y: 34 } : undefined,
			),
		});
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});
		await lifecycle.rebuild();
		const beginGroupDrag = vi.fn();
		vi.spyOn(lifecycle, 'getOrCreateForceLayoutSimulation').mockReturnValue(
			{ beginGroupDrag } as unknown as D3ForceSimulation,
		);
		lifecycle.beginGroupForceDrag(['a', 'missing']);
		expect(beginGroupDrag).toHaveBeenCalledExactlyOnceWith(
			new Map([['a', { x: 12, y: 34 }]]),
		);
		state.enableForceLayout = false;
		lifecycle.beginGroupForceDrag(['a']);
		expect(beginGroupDrag).toHaveBeenCalledOnce();
	});

	it('creates a progressive first frame before large graph layout', async () => {
		const state = createState();
		const renderer = createRenderer();
		const yieldToMainThread = vi.fn(async () => undefined);
		vi.mocked(createWorkspaceRuntimeGraph).mockReturnValue({
			order: 200,
			size: 0,
			nodes: () => ['a'],
		} as never);
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);

		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
			isLargeVaultModeActive: () => true,
			yieldToMainThread,
		});

		await lifecycle.rebuild();

		expect(createWorkspaceGraphRenderer).toHaveBeenCalledOnce();
		expect(
			vi.mocked(createWorkspaceGraphRenderer).mock.invocationCallOrder[0],
		).toBeLessThan(
			vi.mocked(applyStableLayout).mock.invocationCallOrder[0] ?? 0,
		);
		expect(renderer.setGraph).toHaveBeenCalledWith(
			vi.mocked(createWorkspaceRuntimeGraph).mock.results[0]?.value,
		);
		expect(yieldToMainThread).toHaveBeenCalled();
	});

	it('creates a cube renderer for an empty projection', async () => {
		const state = {
			...createState(),
			mode: 'cube' as const,
			projection: {
				nodes: [],
				edges: [],
				rootIds: new Set<string>(),
			},
		};
		const renderer = createRenderer();
		vi.mocked(createWorkspaceRuntimeGraph).mockReturnValue({
			nodes: () => [],
		} as never);
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);

		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
			readLayoutSnapshot: () => createLayoutSnapshot(),
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize: async () => true,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();

		expect(createWorkspaceRuntimeGraph).toHaveBeenCalledOnce();
		expect(createWorkspaceGraphRenderer).toHaveBeenCalledOnce();
		expect(lifecycle.renderer).toBe(renderer);
		expect(renderer.fit).toHaveBeenCalledOnce();
	});

	it('unbinds events and kills the renderer on dispose', async () => {
		const state = createState();
		const renderer = createRenderer();
		const unbind = vi.fn();
		vi.mocked(createWorkspaceGraphRenderer).mockResolvedValue(renderer);
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => createTestCanvas(),
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

	it('isolates renderer DOM and tears G6 down before measuring for Sigma', async () => {
		let state: WorkspaceState = { ...createState(), renderer: 'g6' };
		const canvas = createTestCanvas();
		const g6Renderer = createRenderer();
		const sigmaRenderer = createRenderer();
		const events: string[] = [];
		vi.mocked(getRendererKindForMode).mockImplementation(
			(_mode, renderer) => renderer ?? 'sigma',
		);
		vi.mocked(getRendererKind).mockImplementation((renderer) =>
			renderer === g6Renderer ? 'g6' : 'sigma',
		);
		vi.mocked(createWorkspaceGraphRenderer)
			.mockImplementationOnce(async (options) => {
				Object.assign(options.container.style, {
					display: 'grid',
					isolation: 'isolate',
				});
				return g6Renderer;
			})
			.mockResolvedValueOnce(sigmaRenderer);
		vi.mocked(g6Renderer.kill).mockImplementation(() =>
			events.push('kill-g6'),
		);
		const waitForCanvasSize = vi.fn(async () => {
			events.push('measure');
			return true;
		});
		const lifecycle = new WorkspaceRendererLifecycle({
			readState: () => state,
			readCanvas: () => canvas,
			readLayoutSnapshot: createLayoutSnapshot,
			readContainerSize: () => ({ width: 800, height: 600 }),
			waitForCanvasSize,
			bindEvents: () => vi.fn(),
			syncRendererGroups: vi.fn(),
			setRendererDebugState: vi.fn(),
		});

		await lifecycle.rebuild();
		const firstHost = vi.mocked(createWorkspaceGraphRenderer).mock
			.calls[0]?.[0].container;
		expect(firstHost).not.toBe(canvas);
		expect(firstHost?.className).toBe('knowledge-workspace-renderer-host');
		expect(firstHost?.style.position).toBe('absolute');
		expect(canvas.style.position).toBe('');

		events.length = 0;
		state = { ...state, renderer: 'sigma' };
		await lifecycle.rebuild();

		expect(events).toEqual(['kill-g6', 'measure']);
		expect(firstHost?.isConnected).toBe(false);
		const secondHost = vi.mocked(createWorkspaceGraphRenderer).mock
			.calls[1]?.[0].container;
		expect(secondHost).not.toBe(firstHost);
		expect(secondHost).not.toBe(canvas);
		expect(sigmaRenderer.resize).toHaveBeenCalledOnce();
	});
});
