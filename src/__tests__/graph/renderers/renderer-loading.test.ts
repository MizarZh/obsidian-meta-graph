import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	GraphRenderer,
	RendererCapabilities,
	RendererKind,
} from '@/graph/renderers/renderer-capabilities';
import type { GraphRendererOptions } from '@/graph/renderers/renderer-options';

const mocks = vi.hoisted(() => ({
	loaded: [] as string[],
	create: vi.fn((kind: string, options: unknown) => ({
		capabilities: { kind },
		options,
	})),
}));

beforeEach(() => {
	vi.resetModules();
	mocks.loaded.length = 0;
	mocks.create.mockClear();
	vi.doMock('@/graph/renderers/sigma/sigma-renderer', () => {
		mocks.loaded.push('sigma');
		return {
			SigmaRenderer: class {
				readonly capabilities = { kind: 'sigma' };
				constructor(options: unknown) {
					mocks.create('sigma', options);
				}
			},
		};
	});
	vi.doMock('@/graph/renderers/g6/g6-renderer', () => {
		mocks.loaded.push('g6');
		return {
			G6Renderer: {
				create: (options: unknown) =>
					Promise.resolve(mocks.create('g6', options)),
			},
		};
	});
	vi.doMock('@/graph/renderers/force-3d/force-3d-renderer', () => {
		mocks.loaded.push('force-3d');
		return {
			Force3DRenderer: {
				create: (options: unknown) =>
					Promise.resolve(mocks.create('force-3d', options)),
			},
		};
	});
	vi.doMock('@/graph/renderers/cube-3d/cube-3d-renderer', () => {
		mocks.loaded.push('cube-3d');
		return {
			Cube3DRenderer: {
				create: (options: unknown) =>
					Promise.resolve(mocks.create('cube-3d', options)),
			},
		};
	});
});

function options(
	kind: RendererKind,
	isStale = () => false,
): GraphRendererOptions {
	return { kind, isStale, labelSize: 14 } as GraphRendererOptions;
}

describe('renderer loading boundary', () => {
	it.each(['sigma', 'g6', 'force-3d', 'cube-3d'] as const)(
		'preserves common and engine-specific options for %s',
		async (kind) => {
			const { createGraphRenderer } =
				await import('@/graph/renderers/renderer-factory');
			const supplied: GraphRendererOptions = {
				...options(kind),
				fadeDistance: 0.5,
				labelBold: true,
				labelItalic: true,
				labelPosition: 'left',
				labelOffset: 2,
				labelDensity: 0.3,
				forceLabels: true,
				labelLightTextColor: '#111111',
				labelLightBackgroundColor: '#222222',
				labelLightBackgroundOpacity: 0.4,
				labelDarkTextColor: '#333333',
				labelDarkBackgroundColor: '#444444',
				labelDarkBackgroundOpacity: 0.6,
				scaleLabelsWithZoom: true,
				parallelEdgeStyle: 'curve',
				edgeRoutes: new Map(),
				manualLayout: { nodes: {}, groups: [] },
				cubeFaceOpacity: 0.8,
				cubeSize: 640,
				cubeFreeCamera: true,
				enableForceLayout: true,
			};
			await createGraphRenderer(supplied);
			const baseKeys = [
				'graph',
				'container',
				'palette',
				'fadeDistance',
				'labelSize',
				'labelBold',
				'labelItalic',
				'labelPosition',
				'labelOffset',
				'labelLightTextColor',
				'labelLightBackgroundColor',
				'labelLightBackgroundOpacity',
				'labelDarkTextColor',
				'labelDarkBackgroundColor',
				'labelDarkBackgroundOpacity',
				'labelDensity',
				'forceLabels',
				'threeLabelResolution',
				'isStale',
			] as const;
			const specificKeys = {
				sigma: ['parallelEdgeStyle', 'scaleLabelsWithZoom'],
				g6: ['edgeRoutes', 'scaleLabelsWithZoom'],
				'force-3d': ['enableForceLayout'],
				'cube-3d': [
					'manualLayout',
					'cubeFaceOpacity',
					'cubeSize',
					'cubeFreeCamera',
					'enableForceLayout',
				],
			} as const;
			expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
				kind,
				Object.fromEntries(
					[...baseKeys, ...specificKeys[kind]].map((key) => [
						key,
						supplied[key],
					]),
				),
			);
		},
	);
	it('imports the public adapter and checks capabilities without loading implementations', async () => {
		const adapter = await import('@/graph/renderers/renderer-adapter');
		for (const kind of ['sigma', 'g6', 'force-3d', 'cube-3d'] as const) {
			const planar = kind === 'sigma' || kind === 'g6';
			const capabilities: RendererCapabilities = {
				kind,
				supportsGroupOverlay: planar,
				supportsLayoutGroupGeometry: planar,
				supportsManualLayout: kind === 'cube-3d',
				supportsEdgePicking: kind !== 'cube-3d',
				supportsNodeDragging: true,
				supportsConnectionMoveScheduling: !planar,
				supportsExternal2DForceSimulation: planar,
			};
			const renderer = { capabilities } as GraphRenderer;
			expect(adapter.getRendererCapabilities(renderer)).toBe(
				capabilities,
			);
			expect(adapter.getRendererKind(renderer)).toBe(kind);
			expect(adapter.isSigmaRenderer(renderer)).toBe(kind === 'sigma');
			expect(adapter.isG6Renderer(renderer)).toBe(kind === 'g6');
			expect(adapter.isForce3DRenderer(renderer)).toBe(
				kind === 'force-3d',
			);
			expect(adapter.isCube3DRenderer(renderer)).toBe(kind === 'cube-3d');
			expect(adapter.isPlanarRenderer(renderer)).toBe(planar);
			expect(adapter.isForceSimulationRenderer(renderer)).toBe(planar);
			capabilities.supportsExternal2DForceSimulation = false;
			expect(adapter.isForceSimulationRenderer(renderer)).toBe(false);
		}
		expect(mocks.loaded).toEqual([]);
	});

	it('skips imports for an already stale creation request', async () => {
		const { createGraphRenderer } =
			await import('@/graph/renderers/renderer-factory');
		expect(
			await createGraphRenderer(options('g6', () => true)),
		).toBeUndefined();
		expect(mocks.loaded).toEqual([]);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it.each(['sigma', 'g6', 'force-3d', 'cube-3d'] as const)(
		'loads only %s and rechecks staleness after import',
		async (kind) => {
			const { createGraphRenderer } =
				await import('@/graph/renderers/renderer-factory');
			const previous = [...mocks.loaded];
			mocks.create.mockClear();
			const isStale = vi
				.fn()
				.mockReturnValueOnce(false)
				.mockReturnValue(true);
			expect(
				await createGraphRenderer(options(kind, isStale)),
			).toBeUndefined();
			expect(mocks.loaded).toEqual([...previous, kind]);
			expect(mocks.create).not.toHaveBeenCalled();
			const renderer = await createGraphRenderer(options(kind));
			expect(renderer?.capabilities.kind).toBe(kind);
			expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
				kind,
				expect.objectContaining({ labelSize: 14 }),
			);
			expect(mocks.loaded).toEqual([...previous, kind]);
		},
	);
});
