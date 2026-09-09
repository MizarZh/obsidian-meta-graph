import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRendererLifecycle } from '@/ui/workspace/renderer-lifecycle';
import {
	readChangedVisibilityNodeIds,
	WorkspaceRenderCoordinator,
} from '@/ui/workspace/renderer-coordinator';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import {
	setFlowLayerSpacingInState,
	setFlowLaneSpacingInState,
} from '@/workspace/state/chart-settings';
import { setActiveChartRendererInState } from '@/workspace/state/chart-state';

vi.mock('@/graph/renderers/renderer-adapter', () => ({
	getRendererKind: vi.fn(
		(renderer: { capabilities: { kind: string } }) =>
			renderer.capabilities.kind,
	),
	getRendererKindForMode: vi.fn(
		(_mode: string, renderer: string) => renderer,
	),
	refreshRendererGraphStyles: vi.fn(),
	refreshRendererGraphVisibility: vi.fn(),
}));

describe('WorkspaceRenderCoordinator', () => {
	it.each(['sigma', 'g6'] as const)(
		'preserves spacing through actual chart setters for %s',
		(kind) => {
			const document = createDefaultMetaGraphDocument(200, 1.5);
			document.activeChart = 'learning-flow';
			let state = setActiveChartRendererInState(
				createWorkspaceState(200, 1.5, document),
				kind,
			).state;
			const rebuild = vi.fn(async () => undefined);
			const lifecycle = {
				renderer: { capabilities: { kind } },
				rebuild,
				setSelection: vi.fn(),
				setHovered: vi.fn(),
			} as unknown as WorkspaceRendererLifecycle;
			const coordinator = new WorkspaceRenderCoordinator({
				window: {
					requestAnimationFrame: vi.fn(() => 1),
					cancelAnimationFrame: vi.fn(),
				},
				rendererLifecycle: lifecycle,
				readCanvas: () => undefined,
				readHoveredNodeId: () => undefined,
				syncRendererGroups: vi.fn(),
				setRendererError: vi.fn(),
			});
			coordinator.apply(state, state);
			for (const spacing of [2, 3]) {
				for (const setter of [
					setFlowLayerSpacingInState,
					setFlowLaneSpacingInState,
				]) {
					const next = setter(state, spacing);
					coordinator.apply(next, state);
					expect(rebuild).toHaveBeenLastCalledWith(false, true, true);
					state = next;
				}
			}
			coordinator.apply(
				{ ...state, layoutRevision: state.layoutRevision + 1 },
				state,
			);
			expect(rebuild).toHaveBeenLastCalledWith(true, true, undefined);
		},
	);

	it('applies renderer actions in fixed order', () => {
		const calls: string[] = [];
		const state = createWorkspaceState(200);
		const lifecycle = {
			renderer: undefined,
			handleForceLayoutToggle: () => calls.push('force-toggle'),
			restartExternal2DForceLayoutIfNeeded: () =>
				calls.push('force-restart'),
			rebuild: () => {
				calls.push('rebuild');
				return Promise.resolve();
			},
			setSelection: () => calls.push('selection'),
			setHovered: () => calls.push('hover'),
		} as unknown as WorkspaceRendererLifecycle;
		const coordinator = new WorkspaceRenderCoordinator({
			window: {
				requestAnimationFrame: vi.fn(() => 1),
				cancelAnimationFrame: vi.fn(),
			},
			rendererLifecycle: lifecycle,
			readCanvas: () => undefined,
			readHoveredNodeId: () => undefined,
			syncRendererGroups: () => calls.push('groups'),
			setRendererError: vi.fn(),
		});

		coordinator.apply(state, state);
		expect(calls).toEqual(['rebuild']);
		calls.length = 0;

		const nextState = {
			...state,
			enableForceLayout: !state.enableForceLayout,
			graphSpacing: state.graphSpacing + 1,
			manualLayout: {
				...state.manualLayout,
				nodes: { ...state.manualLayout.nodes },
			},
		};
		coordinator.apply(nextState, state);

		expect(calls).toEqual([
			'groups',
			'force-toggle',
			'groups',
			'force-restart',
			'selection',
			'hover',
		]);
	});

	it('rebuilds when the active renderer instance disagrees with state', () => {
		const calls: string[] = [];
		const state = createWorkspaceState(200);
		const lifecycle = {
			renderer: undefined as { capabilities: { kind: 'g6' } } | undefined,
			handleForceLayoutToggle: vi.fn(),
			restartExternal2DForceLayoutIfNeeded: vi.fn(),
			rebuild: () => {
				calls.push('rebuild');
				return Promise.resolve();
			},
			setSelection: vi.fn(),
			setHovered: vi.fn(),
		} as unknown as WorkspaceRendererLifecycle;
		const coordinator = new WorkspaceRenderCoordinator({
			window: {
				requestAnimationFrame: vi.fn(() => 1),
				cancelAnimationFrame: vi.fn(),
			},
			rendererLifecycle: lifecycle,
			readCanvas: () => undefined,
			readHoveredNodeId: () => undefined,
			syncRendererGroups: vi.fn(),
			setRendererError: vi.fn(),
		});

		coordinator.apply(state, state);
		calls.length = 0;
		(
			lifecycle as unknown as {
				renderer: { capabilities: { kind: 'g6' } };
			}
		).renderer = { capabilities: { kind: 'g6' } };

		coordinator.apply(state, state);

		expect(calls).toEqual(['rebuild']);
	});
});

describe('readChangedVisibilityNodeIds', () => {
	it('returns the symmetric hidden-node difference', () => {
		const projection = {
			nodes: [
				{
					id: 'a.md',
					path: 'a.md',
					title: 'A',
					folder: '',
					domains: [],
					tags: [],
				},
				{
					id: 'b.md',
					path: 'b.md',
					title: 'B',
					folder: '',
					domains: [],
					tags: [],
				},
			],
			edges: [],
			rootIds: new Set<string>(),
			primaryIds: new Set<string>(),
			contextIds: new Set<string>(),
		};

		expect(
			readChangedVisibilityNodeIds(
				{ ...projection, hiddenNodeIds: new Set(['a.md']) },
				{ ...projection, hiddenNodeIds: new Set(['b.md']) },
			),
		).toEqual(['a.md', 'b.md']);
	});
});
