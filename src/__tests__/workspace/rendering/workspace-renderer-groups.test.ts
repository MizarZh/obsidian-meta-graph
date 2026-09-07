import { describe, expect, it, vi } from 'vitest';
import type { PlanarRenderer } from '@/graph/renderers/renderer-adapter';
import type { LayoutSnapshot } from '@/layouts/stable-layout';

describe('workspace renderer groups', () => {
	it('persists positions read back from the renderer after a group move', async () => {
		vi.stubGlobal('WebGLRenderingContext', class {});
		vi.stubGlobal('WebGL2RenderingContext', class {});
		const { moveWorkspaceRuntimeGroupNodes } =
			await import('@/ui/workspace/renderer-groups');
		const moveNodesBy = vi.fn();
		const refresh = vi.fn();
		const renderer = {
			capabilities: { kind: 'g6', supportsGroupOverlay: true },
			moveNodesBy,
			getNodePosition: vi.fn(() => ({ x: 42, y: 24 })),
			refresh,
		} as unknown as PlanarRenderer;
		const snapshot = {
			positions: new Map([['A.md', { x: 10, y: 20 }]]),
		} as unknown as LayoutSnapshot;

		moveWorkspaceRuntimeGroupNodes(renderer, snapshot, ['A.md'], {
			x: 5,
			y: -3,
		});

		expect(moveNodesBy).toHaveBeenCalledExactlyOnceWith(['A.md'], {
			x: 5,
			y: -3,
		});
		expect(snapshot.positions.get('A.md')).toEqual({ x: 42, y: 24 });
		expect(refresh).not.toHaveBeenCalled();
	});

	it('builds Flow containers from canonical membership when ELK geometry is unavailable', async () => {
		vi.stubGlobal('WebGLRenderingContext', class {});
		vi.stubGlobal('WebGL2RenderingContext', class {});
		const { syncWorkspaceRendererGroups } =
			await import('@/ui/workspace/renderer-groups');
		const setGroups = vi.fn();
		const setLayoutGroupGeometries = vi.fn();
		const renderer = {
			capabilities: {
				kind: 'g6',
				supportsGroupOverlay: true,
				supportsLayoutGroupGeometry: true,
				supportsManualLayout: false,
			},
			setGroups,
			setLayoutGroupGeometries,
		} as unknown as PlanarRenderer;
		const snapshot = {
			positions: new Map(),
			edgeIds: new Set(),
			orthogonalRoutes: new Map(),
			groupGeometries: [],
		} as unknown as LayoutSnapshot;

		syncWorkspaceRendererGroups(
			renderer,
			'flow',
			{ nodes: {}, groups: [], groupFrames: {} },
			{
				groups: [
					{
						id: 'group-1',
						name: 'Group 1',
						color: '#7567f8',
						mode: 'rule',
						padding: 0.3,
					},
				],
				overrides: {},
			},
			new Map([
				['A.md', 'group-1'],
				['B.md', 'group-1'],
			]),
			snapshot,
			false,
			{},
		);

		expect(setGroups).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					id: 'group-1',
					shape: 'rectangle',
					dynamicNodeIds: ['A.md', 'B.md'],
					movable: false,
					resizable: false,
				}),
			],
			expect.any(Object),
		);
		expect(setLayoutGroupGeometries).toHaveBeenCalledWith(
			[
				{
					kind: 'member-halos',
					groupId: 'group-1',
					name: 'Group 1',
					color: '#7567f8',
					nodeIds: ['A.md', 'B.md'],
				},
			],
			expect.any(Function),
		);
	});
});
