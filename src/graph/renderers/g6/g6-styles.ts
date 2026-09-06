import type { EdgeData, EdgeOptions, NodeData, NodeOptions } from '@antv/g6';
import type {
	LabelPosition,
	LinkLineStyle,
	NodeShape,
} from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';
import {
	resolveThreeLabelStyle,
	type LabelThemeConfig,
} from '../renderer-label-style';
import { resolveEdgeVisualMetrics } from '../sigma/sigma-edge-visual-metrics';

export type G6NodeStyle = NonNullable<NodeData['style']>;
export type G6EdgeStyle = NonNullable<EdgeData['style']>;

export type G6NodeType =
	'circle' | 'rect' | 'diamond' | 'triangle' | 'hexagon' | 'star';

const NODE_DIAMETER_SCALE = 2;
const MIN_EDGE_THICKNESS = 1.7;

/** Namespaced states avoid inheriting G6 theme styles for reserved state names. */
export const G6_INTERACTION_STATE = {
	dimmed: 'meta-graph-dimmed',
	connected: 'meta-graph-connected',
	focusHidden: 'meta-graph-focus-hidden',
	hovered: 'meta-graph-hovered',
	selected: 'meta-graph-selected',
} as const;

export interface G6DisplayStyleOptions {
	labelSize: number;
	scaleLabelsWithZoom: boolean;
	labelBold: boolean;
	labelItalic: boolean;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelTheme: LabelThemeConfig;
}

export interface G6VisualScale {
	/** Converts Sigma-style visual units into G6 canvas units. */
	geometry: number;
	/** Converts configured label pixels into G6 canvas units. */
	label: number;
	/** Converts fixed screen pixels, such as hit width, into G6 canvas units. */
	screen: number;
}

export interface G6LabelStyles {
	node: G6NodeStyle;
	edge: G6EdgeStyle;
}

const DEFAULT_VISUAL_SCALE: G6VisualScale = {
	geometry: 1,
	label: 1,
	screen: 1,
};

export function createG6ElementStyles(
	palette: GraphPalette,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
): {
	node: Pick<NodeOptions, 'state'>;
	edge: Pick<EdgeOptions, 'state'>;
} {
	return createG6InteractionStyles(palette, visualScale);
}

export function createG6LabelStyles(
	palette: GraphPalette,
	options: G6DisplayStyleOptions,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
): G6LabelStyles {
	const label = resolveThreeLabelStyle(palette, options.labelTheme);
	const labelFontSize =
		resolveG6LabelFontSize(options.labelSize) * visualScale.label;
	const labelPlacement = resolveG6LabelPlacement(options.labelPosition);
	const labelOffset = resolveG6LabelOffset(
		options.labelPosition,
		labelFontSize * options.labelOffset * 0.5,
	);
	const sharedLabelStyle = {
		labelFontSize,
		labelFontWeight: options.labelBold
			? ('bold' as const)
			: ('normal' as const),
		labelFontStyle: options.labelItalic
			? ('italic' as const)
			: ('normal' as const),
		labelFill: label.textColor,
		labelBackground: label.backgroundColor !== 'transparent',
		labelBackgroundFill: label.backgroundColor,
		labelBackgroundOpacity: 1,
		labelPointerEvents: 'none' as const,
		labelPadding: [2 * visualScale.label, 4 * visualScale.label] as [
			number,
			number,
		],
	};
	return {
		node: {
			...sharedLabelStyle,
			labelLineHeight: labelFontSize * 1.2,
			labelPlacement,
			...labelOffset,
		},
		edge: sharedLabelStyle,
	};
}

export function resolveG6LabelFontSize(size: number): number {
	return Math.max(1, finiteOr(size, 12));
}

export function createG6InteractionStyles(
	palette: GraphPalette,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
): {
	node: Pick<NodeOptions, 'state'>;
	edge: Pick<EdgeOptions, 'state'>;
} {
	return {
		node: {
			state: {
				[G6_INTERACTION_STATE.dimmed]: {
					fill: palette.mutedNode,
					label: false,
				},
				[G6_INTERACTION_STATE.hovered]: (data) => ({
					size:
						readNumericSize(data.style?.size) +
						4 * visualScale.screen,
					halo: true,
					haloLineWidth: 3 * visualScale.screen,
					haloStroke: data.style?.fill,
					haloStrokeOpacity: 0.35,
					label: true,
					zIndex: 3,
				}),
				[G6_INTERACTION_STATE.selected]: (data) => ({
					size:
						readNumericSize(data.style?.size) +
						6 * visualScale.screen,
					fill: palette.selected,
					halo: true,
					haloLineWidth: 4 * visualScale.screen,
					haloStroke: palette.selected,
					haloStrokeOpacity: 0.4,
					label: true,
					zIndex: 4,
				}),
			},
		},
		edge: {
			state: {
				[G6_INTERACTION_STATE.dimmed]: {
					stroke: palette.mutedEdge,
					lineWidth: 0.4 * visualScale.geometry,
					opacity: 0.12,
					endArrowFill: palette.mutedEdge,
					endArrowStroke: palette.mutedEdge,
					endArrowFillOpacity: 0.12,
					endArrowStrokeOpacity: 0.12,
					label: false,
				},
				[G6_INTERACTION_STATE.connected]: (data) => ({
					lineWidth:
						readNumericSize(data.style?.lineWidth) +
						visualScale.screen,
					zIndex: 2,
				}),
				[G6_INTERACTION_STATE.hovered]: (data) => ({
					lineWidth:
						readNumericSize(data.style?.lineWidth) +
						2 * visualScale.screen,
					halo: false,
					label: true,
					zIndex: 3,
				}),
				[G6_INTERACTION_STATE.selected]: (data) => ({
					stroke: palette.selected,
					lineWidth:
						readNumericSize(data.style?.lineWidth) +
						2 * visualScale.screen,
					endArrowFill: palette.selected,
					endArrowStroke: palette.selected,
					halo: false,
					label: true,
					zIndex: 4,
				}),
				[G6_INTERACTION_STATE.focusHidden]: {
					opacity: 0,
					endArrowFillOpacity: 0,
					endArrowStrokeOpacity: 0,
					label: false,
				},
			},
		},
	};
}

export function resolveG6NodeType(shape: NodeShape = 'circle'): G6NodeType {
	return shape === 'square' ? 'rect' : shape;
}

export function resolveG6LabelPlacement(
	position: LabelPosition,
): 'center' | 'right' | 'left' | 'top' | 'bottom' {
	return position === 'auto' ? 'right' : position;
}

export function resolveG6LabelOffset(
	position: LabelPosition,
	offset: number,
): { labelOffsetX: number; labelOffsetY: number } {
	const amount = Math.max(0, finiteOr(offset, 0));
	switch (position) {
		case 'left':
			return { labelOffsetX: -amount, labelOffsetY: 0 };
		case 'top':
			return { labelOffsetX: 0, labelOffsetY: -amount };
		case 'bottom':
			return { labelOffsetX: 0, labelOffsetY: amount };
		case 'center':
			return { labelOffsetX: 0, labelOffsetY: 0 };
		default:
			return { labelOffsetX: amount, labelOffsetY: 0 };
	}
}

export function createG6NodeStyle(
	attributes: RuntimeNodeAttributes,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
	labelVisible?: boolean,
	labelStyle?: G6NodeStyle,
): G6NodeStyle {
	const hidden = Boolean(attributes.hidden || attributes.isBend);
	return {
		x: finiteOr(attributes.x, 0),
		y: finiteOr(attributes.y, 0),
		size: Math.max(
			0,
			finiteOr(attributes.size, 0) *
				NODE_DIAMETER_SCALE *
				visualScale.geometry,
		),
		fill: attributes.color,
		opacity: normalizeOpacity(attributes.opacity),
		visibility: hidden ? 'hidden' : 'visible',
		label:
			!hidden &&
			Boolean(attributes.label) &&
			(labelVisible === undefined || labelVisible),
		labelText: attributes.label,
		cursor: attributes.isBend ? 'default' : 'pointer',
		zIndex: attributes.isBend ? 0 : 2,
		...labelStyle,
		...resolveG6RotatedNodeLabelStyle(attributes, visualScale, labelStyle),
	};
}

/** Converts Arc/HEB layout label radians into G6 local label transforms. */
export function resolveG6RotatedNodeLabelStyle(
	attributes: RuntimeNodeAttributes,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
	labelStyle?: G6NodeStyle,
): G6NodeStyle {
	if (!Number.isFinite(attributes.labelRotation)) return {};
	const rotation = attributes.labelRotation ?? 0;
	const direction = attributes.labelDirection ?? 1;
	const placement = String(labelStyle?.labelPlacement ?? 'right');
	const offset = Math.hypot(
		finiteOr(labelStyle?.labelOffsetX, 0),
		finiteOr(labelStyle?.labelOffsetY, 0),
	);
	const configuredFontSize = labelStyle?.labelFontSize;
	const fontSize = finiteOr(
		typeof configuredFontSize === 'number' ? configuredFontSize : undefined,
		12 * visualScale.label,
	);
	const distance =
		Math.max(0, attributes.size) * visualScale.geometry +
		fontSize * 0.25 +
		offset;
	let localX = 0;
	let localY = 0;
	let textAlign: 'left' | 'right' | 'center' = 'center';
	if (placement === 'left') {
		localX = -direction * distance;
		textAlign = direction > 0 ? 'right' : 'left';
	} else if (placement === 'top') {
		localY = -distance;
	} else if (placement === 'bottom') {
		localY = distance;
	} else if (placement !== 'center') {
		localX = direction * distance;
		textAlign = direction > 0 ? 'left' : 'right';
	}
	const cosine = Math.cos(rotation);
	const sine = Math.sin(rotation);
	return {
		labelPlacement: 'center',
		labelOffsetX: 0,
		labelOffsetY: 0,
		labelTextAlign: textAlign,
		labelTextBaseline: 'middle',
		labelTransform: [
			[
				'translate',
				localX * cosine - localY * sine,
				localX * sine + localY * cosine,
			],
			['rotate', (rotation * 180) / Math.PI],
		],
	};
}

export function createG6EdgeStyle(
	attributes: RuntimeEdgeAttributes,
	directed: boolean,
	visualScale: G6VisualScale = DEFAULT_VISUAL_SCALE,
	labelVisible?: boolean,
	labelStyle?: G6EdgeStyle,
): G6EdgeStyle {
	const hidden = Boolean(attributes.hidden);
	const rawLineWidth =
		Math.max(0, finiteOr(attributes.size, 0)) * visualScale.geometry;
	const metrics = resolveEdgeVisualMetrics({
		edgeSize: rawLineWidth,
		arrowSize: attributes.arrowSize,
		arrowStyle: attributes.arrowStyle,
		lineStyle: attributes.lineStyle,
		scaleSize: (size) => size,
		minEdgeThickness: MIN_EDGE_THICKNESS * visualScale.geometry,
	});
	const lineWidth = metrics.nominalLineWidth;
	const opacity = normalizeOpacity(attributes.opacity);
	const showLabel =
		!hidden &&
		Boolean(attributes.label) &&
		(labelVisible ?? attributes.forceLabel);
	return {
		stroke: attributes.color,
		lineWidth,
		lineDash: resolveG6LineDash(attributes.lineStyle, visualScale.geometry),
		// G6 merges style objects for elements whose ids survive setData(). Keep
		// route-owned values explicit so an Arc/HEB path cannot leak into a later
		// ordinary Graph or straight Flow edge.
		controlPoints: [],
		radius: 0,
		labelPlacement: 'center',
		labelAutoRotate: true,
		opacity,
		visibility: hidden ? 'hidden' : 'visible',
		label: showLabel,
		labelText: attributes.label,
		labelOpacity: opacity,
		endArrow: directed,
		endArrowType: attributes.arrowStyle === 'chevron' ? 'vee' : 'triangle',
		endArrowSize: [metrics.arrowLength, metrics.arrowHalfWidth * 2],
		endArrowFill: attributes.color,
		endArrowStroke: attributes.color,
		endArrowFillOpacity: opacity,
		endArrowStrokeOpacity: opacity,
		increasedLineWidthForHitTesting: Math.max(
			0,
			8 * visualScale.screen - lineWidth,
		),
		cursor: hidden ? 'default' : 'pointer',
		zIndex: 1,
		...labelStyle,
	};
}

export function resolveG6LineDash(
	lineStyle: LinkLineStyle,
	scale = 1,
): number[] | undefined {
	const applyScale = (pattern: number[]) =>
		pattern.map((value) => value * scale);
	switch (lineStyle) {
		case 'dashed':
			return applyScale([8, 6]);
		case 'dotted':
			return applyScale([2, 4]);
		case 'dash-dot':
			return applyScale([8, 4, 2, 4]);
		default:
			return undefined;
	}
}

function normalizeOpacity(value: number | undefined): number {
	return Math.min(1, Math.max(0, finiteOr(value, 1)));
}

function finiteOr(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

function readNumericSize(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
