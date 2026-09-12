import type { GraphProjection } from '@/core/types';
import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
import type { NodeBadgeAnchor } from '@/graph/renderers/renderer-node-badge';

export function getNodeBadgeIds(
	projection: GraphProjection | undefined,
	showContext: boolean,
): ReadonlySet<string> {
	const ids = new Set(showContext ? projection?.contextIds : undefined);
	for (const node of projection?.nodes ?? []) {
		if (node.kind === 'unresolved' || node.isEmpty) ids.add(node.id);
	}
	return ids;
}

interface NodeBadgePosition {
	x: number;
	y: number;
	kind: 'context' | 'unresolved' | 'empty';
}

export function collectContextBadgePositions(
	renderer: GraphRenderer | undefined,
	ids: ReadonlySet<string>,
	width: number,
	height: number,
): NodeBadgePosition[] {
	if (!renderer?.getNodeBadgeAnchor) return [];
	const result: NodeBadgePosition[] = [];
	for (const id of ids) {
		if (!renderer.runtimeGraph.hasNode(id)) continue;
		const node = renderer.runtimeGraph.getNodeAttributes(id);
		if (node.hidden || node.isBend || (node.opacity ?? 1) <= 0) continue;
		const anchor: NodeBadgeAnchor | undefined =
			renderer.getNodeBadgeAnchor(id);
		if (
			!anchor ||
			!Number.isFinite(anchor.x) ||
			!Number.isFinite(anchor.y) ||
			!Number.isFinite(anchor.radius)
		)
			continue;
		const offset = Math.max(0, anchor.radius) * 0.75 + 4;
		const x = anchor.x + offset,
			y = anchor.y - offset;
		if (x < -6 || y < -6 || x > width + 6 || y > height + 6) continue;
		result.push({
			x,
			y,
			kind:
				node.kind === 'unresolved'
					? 'unresolved'
					: node.isEmpty
						? 'empty'
						: 'context',
		});
	}
	return result;
}

/** Follow renderer paint events; polling only detects replacement or provides a fallback. */
export function startContextBadges(
	canvas: HTMLCanvasElement,
	readRenderer: () => GraphRenderer | undefined,
	readIds: () => ReadonlySet<string>,
): () => void {
	const win = canvas.ownerDocument.defaultView;
	const context = canvas.getContext('2d');
	if (!win || !context) return () => {};
	let frame = 0;
	let lastTheme = -Infinity;
	let foreground = '#222',
		background = '#fff';
	let active: GraphRenderer | undefined;
	let unsubscribe: (() => void) | undefined;
	let stopped = false;
	let previousIds: ReadonlySet<string> | undefined;
	const draw = (time: number) => {
		if (stopped || readRenderer() !== active) return;
		const width = canvas.clientWidth,
			height = canvas.clientHeight;
		const ratio = win.devicePixelRatio || 1;
		const pixelWidth = Math.round(width * ratio),
			pixelHeight = Math.round(height * ratio);
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		if (canvas.ownerDocument.hidden || width <= 0 || height <= 0) return;
		if (time - lastTheme > 500) {
			const css = win.getComputedStyle(canvas);
			foreground = css.getPropertyValue('--text-normal').trim() || '#222';
			background =
				css.getPropertyValue('--background-primary').trim() || '#fff';
			lastTheme = time;
		}
		const positions = collectContextBadgePositions(
			readRenderer(),
			readIds(),
			width,
			height,
		);
		for (const { x, y, kind } of positions) {
			context.fillStyle = background;
			context.strokeStyle = foreground;
			context.beginPath();
			context.roundRect(x - 6, y - 6, 12, 12, 3);
			context.fill();
			context.lineWidth = 1.25;
			context.lineCap = 'round';
			context.lineJoin = 'round';
			if (kind === 'empty') {
				context.beginPath();
				context.moveTo(x - 3, y - 4);
				context.lineTo(x + 1, y - 4);
				context.lineTo(x + 3, y - 2);
				context.lineTo(x + 3, y + 4);
				context.lineTo(x - 3, y + 4);
				context.lineTo(x - 3, y - 4);
				context.moveTo(x + 1, y - 4);
				context.lineTo(x + 1, y - 2);
				context.lineTo(x + 3, y - 2);
				context.stroke();
				continue;
			}
			if (kind === 'unresolved') {
				context.beginPath();
				context.moveTo(x - 2, y - 2);
				context.bezierCurveTo(x - 2, y - 5, x + 3, y - 5, x + 3, y - 2);
				context.bezierCurveTo(x + 3, y, x, y, x, y + 1);
				context.stroke();
				context.beginPath();
				context.moveTo(x, y + 3.5);
				context.lineTo(x, y + 3.6);
				context.stroke();
				continue;
			}
			// The two open loops and center bar match the link-2 glyph.
			context.beginPath();
			context.moveTo(x - 1.5, y + 2.5);
			context.lineTo(x - 2.5, y + 2.5);
			context.bezierCurveTo(
				x - 5.83,
				y + 2.5,
				x - 5.83,
				y - 2.5,
				x - 2.5,
				y - 2.5,
			);
			context.lineTo(x - 1.5, y - 2.5);
			context.moveTo(x + 1.5, y - 2.5);
			context.lineTo(x + 2.5, y - 2.5);
			context.bezierCurveTo(
				x + 5.83,
				y - 2.5,
				x + 5.83,
				y + 2.5,
				x + 2.5,
				y + 2.5,
			);
			context.lineTo(x + 1.5, y + 2.5);
			context.moveTo(x - 2, y);
			context.lineTo(x + 2, y);
			context.stroke();
		}
	};
	const tick = (time: number) => {
		frame = win.requestAnimationFrame(tick);
		const next = readRenderer();
		const ids = readIds();
		const idsChanged = ids !== previousIds;
		previousIds = ids;
		if (next !== active) {
			unsubscribe?.();
			unsubscribe = undefined;
			active = next;
			if (active?.onNodeBadgeFrame) {
				const owner = active;
				unsubscribe = active.onNodeBadgeFrame(() => {
					if (owner === active) draw(win.performance.now());
				});
			}
			draw(time);
		} else if (!unsubscribe || idsChanged) {
			draw(time);
		}
	};
	frame = win.requestAnimationFrame(tick);
	return () => {
		stopped = true;
		unsubscribe?.();
		win.cancelAnimationFrame(frame);
		context.clearRect(0, 0, canvas.width, canvas.height);
	};
}
