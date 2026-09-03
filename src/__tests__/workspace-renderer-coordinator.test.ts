import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRendererLifecycle } from '../ui/workspace/renderer-lifecycle';
import {
	readChangedVisibilityNodeIds,
	WorkspaceRenderCoordinator,
} from '../ui/workspace/renderer-coordinator';
import { createWorkspaceState } from '../workspace/state/workspace-state';

vi.mock('../graph/renderers/renderer-adapter', () => ({
	refreshRendererGraphStyles: vi.fn(),
	refreshRendererGraphVisibility: vi.fn(),
}));

describe('WorkspaceRenderCoordinator', () => {
	it('applies renderer actions in fixed order', () => {
		const calls: string[] = [];
		const state = createWorkspaceState(200);
		const lifecycle = {
			renderer: undefined,
			handleForceLayoutToggle: () => calls.push('force-toggle'),
			restartSigmaForceLayoutIfNeeded: () => calls.push('force-restart'),
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
