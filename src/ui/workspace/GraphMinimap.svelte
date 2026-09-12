<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
	import { isPlanarRenderer } from '@/graph/renderers/renderer-instance';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import { createMinimapTransform } from './minimap-geometry';
	let {
		readRenderer,
		readCanvas,
	}: {
		readRenderer: () => GraphRenderer | undefined;
		readCanvas: () => HTMLElement | undefined;
	} = $props();
	let map: HTMLCanvasElement;
	let open = $state(true);
	let transform: ReturnType<typeof createMinimapTransform>;
	let viewport: Array<{ x: number; y: number }> = [];
	let drag:
		| {
				id: number;
				renderer: GraphRenderer | undefined;
				invert: (p: { x: number; y: number }) => {
					x: number;
					y: number;
				};
				dx: number;
				dy: number;
		  }
		| undefined;
	let redraw = () => {};
	let panFrame: number | undefined;
	let pending: { x: number; y: number } | undefined;
	let pendingRenderer: GraphRenderer | undefined;
	let drawnRenderer: GraphRenderer | undefined;
	const width = 180,
		height = 120;
	onMount(() => {
		const win = map.ownerDocument.defaultView!;
		let host: HTMLElement | undefined;
		let viewportWidth = 0,
			viewportHeight = 0;
		const observer = new ResizeObserver((entries) => {
			viewportWidth = entries[0]?.contentRect.width ?? 0;
			viewportHeight = entries[0]?.contentRect.height ?? 0;
		});
		const draw = () => {
			if (!open || map.ownerDocument.hidden) return;
			const nextHost = readCanvas();
			if (nextHost !== host) {
				observer.disconnect();
				host = nextHost;
				if (host) observer.observe(host);
			}
			const renderer = readRenderer();
			const context = map.getContext('2d');
			if (!context) return;
			const ratio = Math.min(win.devicePixelRatio || 1, 2);
			if (map.width !== width * ratio || map.height !== height * ratio) {
				map.width = width * ratio;
				map.height = height * ratio;
			}
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			context.clearRect(0, 0, width, height);
			transform = undefined;
			viewport = [];
			drawnRenderer = renderer;
			if (
				!renderer ||
				!isPlanarRenderer(renderer) ||
				!viewportWidth ||
				!viewportHeight
			)
				return;
			const graph = renderer.runtimeGraph;
			const nodes: Array<{
				id: string;
				x: number;
				y: number;
				hidden: boolean;
				color: string;
			}> = [];
			graph.forEachNode((id, a) => {
				if (!a.isBend && Number.isFinite(a.x) && Number.isFinite(a.y))
					nodes.push({
						id,
						x: a.x,
						y: a.y,
						hidden: Boolean(a.hidden),
						color: a.color,
					});
			});
			// Hidden members keep their space, so timeline playback does not rescale the map.
			const project = createMinimapTransform(nodes, width, height);
			if (!project) return;
			transform = project;
			const visible = new Map(
				nodes
					.filter((n) => !n.hidden)
					.map((n) => [n.id, { ...n, ...project(n) }]),
			);
			const css = win.getComputedStyle(map);
			context.strokeStyle =
				css.getPropertyValue('--text-muted').trim() || '#888';
			context.globalAlpha = 0.25;
			context.lineWidth = 0.5;
			context.beginPath();
			const seen = new Set<string>();
			graph.forEachEdge((id, a, source, target) => {
				const logical = a.logicalEdgeId ?? id;
				if (a.hidden || seen.has(logical) || seen.size >= 4000) return;
				const from = visible.get(a.logicalSource ?? source),
					to = visible.get(a.logicalTarget ?? target);
				if (!from || !to) return;
				seen.add(logical);
				context.moveTo(from.x, from.y);
				context.lineTo(to.x, to.y);
			});
			context.stroke();
			context.globalAlpha = 1;
			for (const n of visible.values()) {
				context.fillStyle = n.color || '#888';
				context.beginPath();
				context.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
				context.fill();
			}
			const corners = [
				{ x: 0, y: 0 },
				{ x: viewportWidth, y: 0 },
				{ x: viewportWidth, y: viewportHeight },
				{ x: 0, y: viewportHeight },
			].map((p) => project(renderer.viewportToGraphPosition(p)));
			if (
				corners.some(
					(p) => !Number.isFinite(p.x) || !Number.isFinite(p.y),
				)
			)
				return;
			context.strokeStyle =
				css.getPropertyValue('--interactive-accent').trim() ||
				'#8060ee';
			context.fillStyle = context.strokeStyle;
			context.lineWidth = 1.5;
			context.beginPath();
			corners.forEach((p, i) =>
				i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y),
			);
			context.closePath();
			context.globalAlpha = 0.1;
			context.fill();
			context.globalAlpha = 1;
			context.stroke();
			viewport = corners;
		};
		redraw = draw;
		draw();
		const timer = win.setInterval(draw, 200);
		return () => {
			win.clearInterval(timer);
			if (panFrame !== undefined) win.cancelAnimationFrame(panFrame);
			drag = undefined;
			redraw = () => {};
			observer.disconnect();
		};
	});
	function pan(position: { x: number; y: number }) {
		pending = position;
		pendingRenderer = drawnRenderer;
		if (panFrame !== undefined) return;
		panFrame = map.ownerDocument.defaultView!.requestAnimationFrame(() => {
			panFrame = undefined;
			const renderer = readRenderer();
			if (
				!renderer ||
				renderer !== pendingRenderer ||
				!isPlanarRenderer(renderer)
			)
				return;
			if (pending) renderer.centerViewport(pending);
			redraw();
		});
	}
	function pointer(event: PointerEvent) {
		const rect = map.getBoundingClientRect();
		return {
			x: ((event.clientX - rect.left) * width) / rect.width,
			y: ((event.clientY - rect.top) * height) / rect.height,
		};
	}
	function start(event: PointerEvent) {
		if (event.button !== 0 || !transform || viewport.length !== 4) return;
		event.preventDefault();
		map.focus();
		const p = pointer(event);
		// Convex footprint test also handles rotated cameras.
		const cross = viewport.map((a, i) => {
			const b = viewport[(i + 1) % viewport.length]!;
			return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
		});
		const inside = cross.every((v) => v >= 0) || cross.every((v) => v <= 0);
		const center = {
			x: viewport.reduce((s, v) => s + v.x, 0) / 4,
			y: viewport.reduce((s, v) => s + v.y, 0) / 4,
		};
		drag = {
			id: event.pointerId,
			renderer: drawnRenderer,
			invert: transform.invert,
			dx: inside ? center.x - p.x : 0,
			dy: inside ? center.y - p.y : 0,
		};
		map.setPointerCapture(event.pointerId);
		if (!inside) pan(drag.invert(p));
	}
	function move(event: PointerEvent) {
		if (!drag || drag.id !== event.pointerId) return;
		if (drag.renderer !== readRenderer()) { drag = undefined; return; }
		const p = pointer(event);
		pan(drag.invert({ x: p.x + drag.dx, y: p.y + drag.dy }));
	}
	function stop(event: PointerEvent) {
		if (drag?.id !== event.pointerId) return;
		if (event.type === 'pointerup') move(event);
		drag = undefined;
		if (map.hasPointerCapture(event.pointerId))
			map.releasePointerCapture(event.pointerId);
	}
</script>

<aside class="knowledge-workspace-minimap" aria-label="Minimap">
	<ObsidianButton
		text="Minimap"
		ariaLabel={open ? 'Collapse minimap' : 'Expand minimap'}
		onClick={() => (open = !open)}
	/>
	<canvas
		bind:this={map}
		hidden={!open}
		style="width: 180px; height: 120px"
		role="button"
		tabindex="0"
		aria-label="Minimap: drag the viewport or click to pan; arrow keys move the viewport"
		onpointerdown={start}
		onpointermove={move}
		onpointerup={stop}
		onpointercancel={stop}
		onlostpointercapture={() => (drag = undefined)}
		onkeydown={(event) => {
			if (!transform || viewport.length !== 4) return;
			const deltas: Record<string, [number, number]> = {
				ArrowLeft: [-10, 0],
				ArrowRight: [10, 0],
				ArrowUp: [0, -10],
				ArrowDown: [0, 10],
			};
			const delta = deltas[event.key];
			if (delta) {
				event.preventDefault();
				pan(
					transform.invert({
						x: viewport.reduce((s, v) => s + v.x, 0) / 4 + delta[0],
						y: viewport.reduce((s, v) => s + v.y, 0) / 4 + delta[1],
					}),
				);
			}
		}}
	></canvas>
</aside>
