import { Line, Quadratic, type BaseEdge, type Label } from '@antv/g6';

// G6 5.1 compatibility seam. Only these native edges use the fast path.
export const POSITION_ONLY_EDGE_TYPES: ReadonlySet<unknown> = new Set([
	Line,
	Quadratic,
]);
interface EdgeGeometry {
	getKeyPath(
		attributes: BaseEdge['attributes'],
	): ReturnType<BaseEdge['getKeyStyle']>['d'];
	getLabelStyle(
		attributes: BaseEdge['attributes'],
	): false | Label['attributes'];
}

/** Called only by a translate-stage hook, never by a style/state update. */
export function updateG6EdgePosition(edge: BaseEdge): boolean {
	const attributes = edge.attributes;
	const key = edge.getShape('key');
	// Self-loops, badges and custom geometry keep G6's complete update path.
	if (
		!key ||
		attributes.sourceNode === attributes.targetNode ||
		attributes.badgeText
	)
		return false;
	const geometry = edge as unknown as EdgeGeometry;
	if (typeof geometry.getKeyPath !== 'function') return false;
	const path = geometry.getKeyPath(attributes);
	// Updating d also lets G reposition existing start/end markers. Their
	// color, size and shape do not change when only the endpoints move.
	key.setAttribute('d', path);
	edge.getShape('halo')?.setAttribute('d', path);
	const label = edge.getShape<Label>('label');
	if (attributes.label !== false && attributes.labelText && label) {
		const next = geometry.getLabelStyle(attributes);
		if (next) updateLabelPosition(label, next);
	}
	return true;
}

function updateLabelPosition(label: Label, next: Label['attributes']): void {
	const previous = label.attributes;
	const { transform, wordWrapWidth, ...appearance } = next;
	const sameAppearance = Object.entries(appearance).every(([key, value]) =>
		Object.is(previous[key as keyof typeof previous], value),
	);
	let sameTextLayout =
		!previous.wordWrap || previous.wordWrapWidth === wordWrapWidth;
	if (!sameTextLayout && sameAppearance) {
		const text = label.getShape('text');
		const bounds = text?.getGeometryBounds();
		const metrics = (
			text?.parsedStyle as { metrics?: { lines?: string[] } } | undefined
		)?.metrics;
		// Reuse the measured, untruncated single line only while it fits both
		// widths. Wrapping/truncation changes must still rebuild text/background.
		sameTextLayout = Boolean(
			bounds &&
			metrics?.lines?.length === 1 &&
			metrics.lines[0] === String(previous.text) &&
			bounds.halfExtents[0] * 2 <
				Math.min(Number(previous.wordWrapWidth), Number(wordWrapWidth)),
		);
	}
	if (sameAppearance && sameTextLayout) {
		label.setAttribute('transform', transform);
	} else {
		label.update(next);
	}
}
