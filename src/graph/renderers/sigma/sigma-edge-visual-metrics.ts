import type { RuntimeEdgeAttributes } from '../../model/graphology-adapter';
import { getParallelLaneStep } from '../../model/parallel-edges';

export const EDGE_DASH_PATTERNS = {
	dashed: [10, 7],
	dotted: [2, 5],
	'dash-dot': [10, 5, 2, 5],
} as const;

export const EDGE_ARROW_RATIOS = {
	filled: {
		lengthToThicknessRatio: 2.5,
		widenessToThicknessRatio: 2,
	},
	chevron: {
		lengthToThicknessRatio: 2.25,
		widenessToThicknessRatio: 2.75,
	},
} as const;

export const EDGE_CHEVRON_WING_RATIO = 0.145;

export interface EdgeVisualMetrics {
	nominalLineWidth: number;
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
	antiAliasingFeather?: number;
	pixelRatio?: number;
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
	// Sigma's correction ratio maps this value to the complete CSS-pixel width,
	// even though its shader expands geometry on both sides of the center line.
	const nominalLineWidth = Math.max(scaledEdgeSize, minEdgeThickness);
	const pixelRatio = positiveFinite(options.pixelRatio, 1);
	const antiAliasingFeather = nonNegativeFinite(
		options.antiAliasingFeather,
		0,
	);
	// Sigma feathers the native WebGL rectangle inward on both sides. Canvas
	// stroke coverage preserves its complete nominal width, so compensate by the
	// alpha-equivalent feather width. Keep at least one physical pixel visible.
	const lineWidth = Math.max(
		1 / pixelRatio,
		nominalLineWidth - antiAliasingFeather / pixelRatio,
	);
	const zoomScale = positiveFinite(options.scaleSize(1), 1);
	const arrowScale = Math.max(0.25, positiveFinite(options.arrowSize, 1));
	const arrowRatios =
		EDGE_ARROW_RATIOS[
			options.arrowStyle === 'chevron' ? 'chevron' : 'filled'
		];

	return {
		nominalLineWidth,
		lineWidth,
		arrowLength:
			nominalLineWidth *
			arrowRatios.lengthToThicknessRatio *
			arrowScale,
		arrowHalfWidth:
			(nominalLineWidth *
				arrowRatios.widenessToThicknessRatio *
				arrowScale) /
			2,
		dashPattern: getScaledDashPattern(options.lineStyle, zoomScale),
		laneStep: getParallelLaneStep(nominalLineWidth),
		hitWidth: Math.max(6, nominalLineWidth + 2),
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

function nonNegativeFinite(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}
