import type { EdgeData, NodeData } from '@antv/g6';
import type { LinkLineStyle, NodeShape } from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';

export type G6NodeStyle = NonNullable<NodeData['style']>;
export type G6EdgeStyle = NonNullable<EdgeData['style']>;

export type G6NodeType =
	'circle' | 'rect' | 'diamond' | 'triangle' | 'hexagon' | 'star';

const NODE_DIAMETER_SCALE = 2;
const DEFAULT_ARROW_SIZE = 8;

export function resolveG6NodeType(shape: NodeShape = 'circle'): G6NodeType {
	return shape === 'square' ? 'rect' : shape;
}

export function createG6NodeStyle(
	attributes: RuntimeNodeAttributes,
): G6NodeStyle {
	const hidden = Boolean(attributes.hidden || attributes.isBend);
	return {
		x: finiteOr(attributes.x, 0),
		y: finiteOr(attributes.y, 0),
		size: Math.max(0, finiteOr(attributes.size, 0) * NODE_DIAMETER_SCALE),
		fill: attributes.color,
		opacity: normalizeOpacity(attributes.opacity),
		visibility: hidden ? 'hidden' : 'visible',
		label: !hidden && Boolean(attributes.label),
		labelText: attributes.label,
		cursor: attributes.isBend ? 'default' : 'pointer',
		zIndex: attributes.isBend ? 0 : 2,
	};
}

export function createG6EdgeStyle(
	attributes: RuntimeEdgeAttributes,
	directed: boolean,
): G6EdgeStyle {
	const hidden = Boolean(attributes.hidden);
	const lineWidth = Math.max(0, finiteOr(attributes.size, 0));
	const opacity = normalizeOpacity(attributes.opacity);
	const labelVisible =
		!hidden && attributes.forceLabel && Boolean(attributes.label);
	return {
		stroke: attributes.color,
		lineWidth,
		lineDash: resolveG6LineDash(attributes.lineStyle),
		opacity,
		visibility: hidden ? 'hidden' : 'visible',
		label: labelVisible,
		labelText: attributes.label,
		labelFill: attributes.color,
		labelOpacity: opacity,
		endArrow: directed,
		endArrowType: attributes.arrowStyle === 'chevron' ? 'vee' : 'triangle',
		endArrowSize:
			DEFAULT_ARROW_SIZE * normalizeArrowScale(attributes.arrowSize),
		endArrowFill: attributes.color,
		endArrowStroke: attributes.color,
		endArrowFillOpacity: opacity,
		endArrowStrokeOpacity: opacity,
		increasedLineWidthForHitTesting: Math.max(0, 8 - lineWidth),
		cursor: hidden ? 'default' : 'pointer',
		zIndex: 1,
	};
}

export function resolveG6LineDash(
	lineStyle: LinkLineStyle,
): number[] | undefined {
	switch (lineStyle) {
		case 'dashed':
			return [8, 6];
		case 'dotted':
			return [2, 4];
		case 'dash-dot':
			return [8, 4, 2, 4];
		default:
			return undefined;
	}
}

function normalizeOpacity(value: number | undefined): number {
	return Math.min(1, Math.max(0, finiteOr(value, 1)));
}

function normalizeArrowScale(value: number | undefined): number {
	return Math.max(0.25, finiteOr(value, 1));
}

function finiteOr(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}
