import { DEFAULT_NODE_BADGES } from '@/workspace/meta-graph/node-badges';
import type {
	GraphProjection,
	GraphTraceRequest,
	NodeBadgeSettings,
} from '@/core/types';
import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
import type { NodeBadgeAnchor } from '@/graph/renderers/renderer-node-badge';

export function getNodeBadgeIds(
	projection: GraphProjection | undefined,
	showContext: boolean,
	trace?: GraphTraceRequest,
): ReadonlySet<string> {
	const ids = new Set(showContext ? projection?.contextIds : undefined);
	for (const node of projection?.nodes ?? []) {
		if (node.kind === 'unresolved' || node.isEmpty) ids.add(node.id);
	}
	if (trace?.source) ids.add(trace.source);
	if (trace?.mode === 'path' && trace.target) ids.add(trace.target);
	return ids;
}

interface NodeBadgePosition {
	scale: number;
	x: number;
	y: number;
	kind: 'context' | 'unresolved' | 'empty' | 'start' | 'end' | 'endpoints';
}

export function collectContextBadgePositions(
	renderer: GraphRenderer | undefined,
	ids: ReadonlySet<string>,
	width: number,
	height: number,
	trace?: GraphTraceRequest,
	settings: NodeBadgeSettings = DEFAULT_NODE_BADGES,
): NodeBadgePosition[] {
	if (!settings.enabled || !renderer?.getNodeBadgeAnchor) return [];
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
			!Number.isFinite(anchor.radius) ||
			anchor.radius <= 0
		)
			continue;
		// Preserve the original 12px badge at an 8px rendered node radius.
		const scale = (anchor.radius / 8) * settings.scale;
		const offset = anchor.radius * 0.75 + 4 * scale;
		const halfSize = 6 * scale;
		const x =
				anchor.x +
				(settings.position.endsWith('right') ? offset : -offset),
			y =
				anchor.y +
				(settings.position.startsWith('bottom') ? offset : -offset);
		if (
			x < -halfSize ||
			y < -halfSize ||
			x > width + halfSize ||
			y > height + halfSize
		)
			continue;
		result.push({
			scale,
			x,
			y,
			kind:
				trace?.source === id
					? trace.mode === 'path' && trace.target === id
						? 'endpoints'
						: 'start'
					: trace?.mode === 'path' && trace.target === id
						? 'end'
						: node.kind === 'unresolved'
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
	readTrace: () => GraphTraceRequest | undefined = () => undefined,
	readSettings: () => NodeBadgeSettings = () => DEFAULT_NODE_BADGES,
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
	let previousSettings: NodeBadgeSettings | undefined;
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
			readTrace(),
			readSettings(),
		);
		for (const { x: anchorX, y: anchorY, scale, kind } of positions) {
			// Scale glyph, background, stroke and text together in local coordinates.
			context.setTransform(
				ratio * scale,
				0,
				0,
				ratio * scale,
				ratio * anchorX,
				ratio * anchorY,
			);
			const x = 0,
				y = 0;
			context.fillStyle = background;
			context.strokeStyle = foreground;
			context.beginPath();
			context.roundRect(x - 6, y - 6, 12, 12, 3);
			context.fill();
			context.lineWidth = 1.25;
			context.lineCap = 'round';
			context.lineJoin = 'round';
			if (kind === 'start' || kind === 'end' || kind === 'endpoints') {
				context.fillStyle = foreground;
				context.font =
					kind === 'endpoints'
						? 'bold 7px sans-serif'
						: 'bold 10px sans-serif';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText(
					kind === 'start' ? 'A' : kind === 'end' ? 'B' : 'A/B',
					x,
					y,
				);
				continue;
			}
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
		const settings = readSettings();
		const settingsChanged = settings !== previousSettings;
		previousSettings = settings;
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
		} else if (!unsubscribe || idsChanged || settingsChanged) {
			draw(time);
		}
	};
	frame = win.requestAnimationFrame(tick);
	return () => {
		stopped = true;
		unsubscribe?.();
		win.cancelAnimationFrame(frame);
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, canvas.width, canvas.height);
	};
}
