import { DEFAULT_NODE_BADGES } from '@/workspace/meta-graph/node-badges';
import { describe, expect, it, vi } from 'vitest';
import Graph from 'graphology';
import { PerspectiveCamera, Sprite, SpriteMaterial } from 'three';
import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
import { projectSpriteBadge } from '@/graph/renderers/renderer-node-badge';
import {
	collectContextBadgePositions,
	getNodeBadgeIds,
	startContextBadges,
} from '@/ui/workspace/context-badges';

function renderer() {
	const graph = new Graph();
	graph.addNode('context', { x: 0, y: 0, size: 10, opacity: 0.2 });
	return {
		runtimeGraph: graph,
		getNodeBadgeAnchor: vi.fn(() => ({ x: 50, y: 50, radius: 8 })),
	} as unknown as GraphRenderer;
}

describe('context badges', () => {
	it('shows temporary A/B endpoint badges ahead of status badges', () => {
		const current = renderer();
		current.runtimeGraph.setNodeAttribute('context', 'kind', 'unresolved');
		const request = {
			mode: 'path' as const,
			source: 'context',
			target: 'other',
		};
		expect(getNodeBadgeIds(undefined, false, request)).toEqual(
			new Set(['context', 'other']),
		);
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				100,
				100,
				request,
			)[0]?.kind,
		).toBe('start');
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				100,
				100,
				{ ...request, source: 'other', target: 'context' },
			)[0]?.kind,
		).toBe('end');
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				100,
				100,
				{ ...request, target: 'context' },
			)[0]?.kind,
		).toBe('endpoints');
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				100,
				100,
			)[0]?.kind,
		).toBe('unresolved');
	});
	it('shows empty-note badges independently of context and clears them when filled', () => {
		const current = renderer();
		current.runtimeGraph.setNodeAttribute('context', 'isEmpty', true);
		const node = {
			id: 'context',
			path: 'Empty.md',
			title: 'Empty',
			folder: '',
			tags: [],
			domains: [],
			isEmpty: true,
		};
		const projection = {
			nodes: [node],
			edges: [],
			rootIds: new Set<string>(),
			contextIds: new Set(['context']),
		};
		expect(getNodeBadgeIds(projection, false)).toEqual(
			new Set(['context']),
		);
		expect(
			collectContextBadgePositions(
				current,
				getNodeBadgeIds(projection, true),
				100,
				100,
			),
		).toEqual([{ x: 60, y: 40, scale: 1, kind: 'empty' }]);
		current.runtimeGraph.setNodeAttribute('context', 'kind', 'unresolved');
		expect(
			collectContextBadgePositions(
				current,
				getNodeBadgeIds(projection, true),
				100,
				100,
			)[0]?.kind,
		).toBe('unresolved');
		node.isEmpty = false;
		current.runtimeGraph.setNodeAttribute('context', 'kind', 'note');
		current.runtimeGraph.setNodeAttribute('context', 'isEmpty', false);
		expect(getNodeBadgeIds(projection, false).size).toBe(0);
		expect(
			collectContextBadgePositions(
				current,
				getNodeBadgeIds(projection, true),
				100,
				100,
			)[0]?.kind,
		).toBe('context');
	});

	it('shows unresolved badges without context expansion and prioritizes unresolved identity', () => {
		const current = renderer();
		current.runtimeGraph.setNodeAttribute('context', 'kind', 'unresolved');
		const projection = {
			nodes: [
				{
					id: 'context',
					path: 'missing.md',
					title: 'Missing',
					kind: 'unresolved' as const,
					folder: '',
					tags: [],
					domains: [],
				},
			],
			edges: [],
			rootIds: new Set<string>(),
			contextIds: new Set(['context', 'extra']),
		};
		expect(getNodeBadgeIds(projection, false)).toEqual(
			new Set(['context']),
		);
		expect(getNodeBadgeIds(projection, true)).toEqual(
			new Set(['context', 'extra']),
		);
		expect(
			collectContextBadgePositions(
				current,
				getNodeBadgeIds(projection, true),
				100,
				100,
			),
		).toEqual([{ x: 60, y: 40, scale: 1, kind: 'unresolved' }]);
		current.runtimeGraph.setNodeAttribute('context', 'hidden', true);
		expect(
			collectContextBadgePositions(
				current,
				getNodeBadgeIds(projection, false),
				100,
				100,
			),
		).toEqual([]);
		expect(getNodeBadgeIds(undefined, true).size).toBe(0);
	});

	it('follows the rendered footprint without changing node opacity, and skips invisible nodes', () => {
		const current = renderer();
		const ids = new Set(['context', 'missing']);
		expect(collectContextBadgePositions(current, ids, 100, 100)).toEqual([
			{ x: 60, y: 40, scale: 1, kind: 'context' },
		]);
		expect(
			current.runtimeGraph.getNodeAttribute('context', 'opacity'),
		).toBe(0.2);
		current.runtimeGraph.setNodeAttribute('context', 'hidden', true);
		expect(collectContextBadgePositions(current, ids, 100, 100)).toEqual(
			[],
		);
		current.runtimeGraph.setNodeAttribute('context', 'hidden', false);
		current.runtimeGraph.setNodeAttribute('context', 'opacity', 0);
		expect(collectContextBadgePositions(current, ids, 100, 100)).toEqual(
			[],
		);
		current.runtimeGraph.setNodeAttribute('context', 'opacity', 1);
		expect(collectContextBadgePositions(current, ids, 10, 10)).toEqual([]);
		vi.mocked(current.getNodeBadgeAnchor!).mockReturnValue({
			x: NaN,
			y: 0,
			radius: 2,
		});
		expect(collectContextBadgePositions(current, ids, 100, 100)).toEqual(
			[],
		);
	});

	it('scales badge size and offset with the rendered node footprint', () => {
		const current = renderer();
		for (const radius of [2, 4, 8, 16, 32]) {
			vi.mocked(current.getNodeBadgeAnchor!).mockReturnValue({
				x: 50,
				y: 50,
				radius,
			});
			const badge = collectContextBadgePositions(
				current,
				new Set(['context']),
				200,
				200,
			)[0]!;
			expect((badge.scale * 12) / radius).toBe(1.5);
			expect((badge.x - 50) / radius).toBe(1.25);
			expect((50 - badge.y) / radius).toBe(1.25);
		}
		vi.mocked(current.getNodeBadgeAnchor!).mockReturnValue({
			x: 50,
			y: 50,
			radius: 0,
		});
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				200,
				200,
			),
		).toEqual([]);
	});

	it('applies relative sizing, each corner, and badge visibility', () => {
		const current = renderer();
		for (const position of [
			'top-right',
			'top-left',
			'bottom-right',
			'bottom-left',
		] as const) {
			const badge = collectContextBadgePositions(
				current,
				new Set(['context']),
				200,
				200,
				undefined,
				{ ...DEFAULT_NODE_BADGES, position, scale: 2 },
			)[0]!;
			expect(badge.scale).toBe(2);
			expect(badge.x).toBe(position.endsWith('right') ? 64 : 36);
			expect(badge.y).toBe(position.startsWith('bottom') ? 64 : 36);
		}
		expect(
			collectContextBadgePositions(
				current,
				new Set(['context']),
				200,
				200,
				undefined,
				{ ...DEFAULT_NODE_BADGES, enabled: false },
			),
		).toEqual([]);
	});

	it('draws immediately after renderer paint and detaches stale frame callbacks', () => {
		const callbacks: FrameRequestCallback[] = [];
		const context = Object.fromEntries(
			[
				'setTransform',
				'clearRect',
				'beginPath',
				'roundRect',
				'fill',
				'stroke',
				'moveTo',
				'lineTo',
				'bezierCurveTo',
			].map((name) => [name, vi.fn()]),
		);
		const cancel = vi.fn();
		const canvas = {
			clientWidth: 100,
			clientHeight: 80,
			width: 0,
			height: 0,
			getContext: () => context,
			ownerDocument: {
				hidden: false,
				defaultView: {
					devicePixelRatio: 2,
					performance: { now: () => 16 },
					requestAnimationFrame: (callback: FrameRequestCallback) =>
						callbacks.push(callback),
					cancelAnimationFrame: cancel,
					getComputedStyle: () => ({ getPropertyValue: () => '' }),
				},
			},
		} as unknown as HTMLCanvasElement;
		const first = renderer(),
			second = renderer();
		let onPaint: (() => void) | undefined;
		const detach = vi.fn();
		second.onNodeBadgeFrame = (listener) => {
			onPaint = listener;
			return detach;
		};
		let active: GraphRenderer | undefined = first;
		const badgeIds = new Set(['context']);
		const stop = startContextBadges(
			canvas,
			() => active,
			() => badgeIds,
		);
		callbacks[0]!(0);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(160);
		expect(context.setTransform).toHaveBeenLastCalledWith(
			2,
			0,
			0,
			2,
			120,
			80,
		);
		active = second;
		callbacks[1]!(16);
		expect(first.getNodeBadgeAnchor).toHaveBeenCalledOnce();
		expect(second.getNodeBadgeAnchor).toHaveBeenCalledOnce();
		callbacks[2]!(32);
		expect(second.getNodeBadgeAnchor).toHaveBeenCalledOnce();
		// No further animation frame is needed to catch the node's new rendered position.
		onPaint!();
		expect(second.getNodeBadgeAnchor).toHaveBeenCalledTimes(2);
		active = undefined;
		onPaint!();
		expect(second.getNodeBadgeAnchor).toHaveBeenCalledTimes(2);
		callbacks[3]!(48);
		expect(detach).toHaveBeenCalledOnce();
		expect(context.roundRect).toHaveBeenCalledTimes(3);
		stop();
		onPaint!();
		expect(context.roundRect).toHaveBeenCalledTimes(3);
		expect(cancel).toHaveBeenCalledWith(5);
	});

	it('projects 3D badges with camera zoom and rejects hidden or behind-camera sprites', () => {
		const camera = new PerspectiveCamera(60, 1, 0.1, 100);
		camera.position.z = 10;
		const sprite = new Sprite(new SpriteMaterial());
		sprite.scale.set(2, 2, 1);
		const far = projectSpriteBadge(sprite, camera, 200, 200)!;
		expect(far.x).toBeCloseTo(100);
		expect(far.y).toBeCloseTo(100);
		camera.position.z = 5;
		expect(
			projectSpriteBadge(sprite, camera, 200, 200)!.radius,
		).toBeCloseTo(far.radius * 2);
		sprite.position.z = 10;
		expect(projectSpriteBadge(sprite, camera, 200, 200)).toBeUndefined();
		sprite.position.z = 0;
		sprite.visible = false;
		expect(projectSpriteBadge(sprite, camera, 200, 200)).toBeUndefined();
	});
});
