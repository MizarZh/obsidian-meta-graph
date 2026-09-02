import type { RuntimeEdgeAttributes } from '../../model/graphology-adapter';
import { getParallelLaneStep } from '../../model/parallel-edges';

export const EDGE_DASH_PATTERNS = {
	dashed: [10, 7],
	dotted: [2, 5],
	'dash-dot': [10, 5, 2, 5],
} as const;

export interface EdgeVisualMetrics {
	lineWidth: number;
	arrowLength: number;
	arrowHalfWidth: number;
	dashPattern: number[];
	laneStep: number;
	hitWidth: number;
}

export interface EdgeVisualMetricsOptions {
	edgeSize?: number;
	arrowSize?: number;
	arrowStyle?: RuntimeEdgeAttributes['arrowStyle'];
	lineStyle?: RuntimeEdgeAttributes['lineStyle'];
	scaleSize: (size: number) => number;
	minEdgeThickness: number;
}

/**
 * Resolves Canvas edge dimensions with Sigma's screen-space zoom policy.
 * Hit width remains independent from visible geometry for reliable picking.
 */
export function resolveEdgeVisualMetrics(
	options: EdgeVisualMetricsOptions,
): EdgeVisualMetrics {
	const edgeSize = positiveFinite(options.edgeSize, 1);
	const scaledEdgeSize = positiveFinite(
		options.scaleSize(edgeSize),
		edgeSize,
	);
	const minEdgeThickness = positiveFinite(options.minEdgeThickness, 1);
	const lineWidth = Math.max(scaledEdgeSize, minEdgeThickness);
	const zoomScale = positiveFinite(options.scaleSize(1), 1);
	const arrowScale = Math.max(0.25, positiveFinite(options.arrowSize, 1));
	const chevron = options.arrowStyle === 'chevron';

	return {
		lineWidth,
		arrowLength: lineWidth * (chevron ? 4.5 : 5) * arrowScale,
		arrowHalfWidth: lineWidth * (chevron ? 2.75 : 2) * arrowScale,
		dashPattern: getScaledDashPattern(options.lineStyle, zoomScale),
		laneStep: getParallelLaneStep(lineWidth),
		hitWidth: Math.max(6, lineWidth * 2 + 2),
	};
}

export function getScaledDashPattern(
	lineStyle: RuntimeEdgeAttributes['lineStyle'] | undefined,
	zoomScale = 1,
): number[] {
	const pattern =
		lineStyle === 'dashed' ||
		lineStyle === 'dotted' ||
		lineStyle === 'dash-dot'
			? EDGE_DASH_PATTERNS[lineStyle]
			: undefined;
	if (!pattern) return [];
	const scale = positiveFinite(zoomScale, 1);
	return pattern.map((length) => length * scale);
}

function positiveFinite(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? value
		: fallback;
}
