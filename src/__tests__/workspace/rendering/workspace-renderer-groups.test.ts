import { describe, expect, it, vi } from 'vitest';
import type { PlanarRenderer } from '../../../graph/renderers/renderer-adapter';
import type { LayoutSnapshot } from '../../../layouts/stable-layout';

describe('workspace renderer groups', () => {
	it('persists positions read back from the renderer after a group move', async () => {
		vi.stubGlobal('WebGLRenderingContext', class {});
		vi.stubGlobal('WebGL2RenderingContext', class {});
		const { moveWorkspaceRuntimeGroupNodes } = await import(
			'../../../ui/workspace/renderer-groups'
		);
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

		moveWorkspaceRuntimeGroupNodes(
			renderer,
			snapshot,
			['A.md'],
			{ x: 5, y: -3 },
		);

		expect(moveNodesBy).toHaveBeenCalledExactlyOnceWith(
			['A.md'],
			{ x: 5, y: -3 },
		);
		expect(snapshot.positions.get('A.md')).toEqual({ x: 42, y: 24 });
		expect(refresh).not.toHaveBeenCalled();
	});
});
