import { type NodeHoverDrawingFunction } from 'sigma/rendering';
import type {
	EdgeLabelDrawingFunction,
	NodeLabelDrawingFunction,
} from 'sigma/rendering';
import type { NodeDisplayData } from 'sigma/types';
import type { LabelPosition } from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import {
	getNodeLabelBox,
	getRotatedNodeLabelBox,
} from './sigma-label-geometry';
import { CanvasTextWidthCache } from './canvas-text-metrics';

export function createNodeLabelDrawer(
	getRenderedLabelSize: (baseSize: number) => number,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelOffset: () => number,
	getLabelColor: () => string,
	getLabelBackground: () => string,
	getLabelStyle: () => 'normal' | 'italic',
	textWidthCache: CanvasTextWidthCache,
): NodeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (!data.label) {
			return;
		}

		const labelSize = getRenderedLabelSize(settings.labelSize);
		const labelStyle = getLabelStyle();
		const font = `${labelStyle} ${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
		const paddingX = 5;
		const paddingY = 3;
		context.save();
		context.font = font;
		context.textBaseline = 'middle';
		const textWidth = textWidthCache.measure(context, data.label, {
			family: settings.labelFont,
			weight: settings.labelWeight,
			style: labelStyle,
			size: labelSize,
		});
		const width = textWidth + paddingX * 2;
		const height = labelSize + paddingY * 2;
		context.globalAlpha = getOpacity();
		drawNodeLabel(
			context,
			data,
			width,
			height,
			paddingX,
			getLabelPosition(),
			getLabelGap(labelSize, getLabelOffset()),
			getLabelBackground(),
			getLabelColor(),
		);
		context.restore();
	};
}

export function createNodeHoverDrawer(
	getRenderedLabelSize: (baseSize: number) => number,
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelOffset: () => number,
	getLabelColor: () => string,
	getLabelBackground: () => string,
	getLabelStyle: () => 'normal' | 'italic',
	textWidthCache: CanvasTextWidthCache,
): NodeHoverDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (data.hidden) return;
		if (typeof data.label !== 'string') return;

		const { labelFont: font, labelWeight: weight } = settings;
		const size = getRenderedLabelSize(settings.labelSize);
		const labelStyle = getLabelStyle();
		context.font = `${labelStyle} ${weight} ${size}px ${font}`;

		context.save();
		context.globalAlpha = getOpacity();
		context.fillStyle = getLabelBackground();
		context.shadowOffsetX = 0;
		context.shadowOffsetY = 0;
		context.shadowBlur = 8;
		context.shadowColor = 'rgba(0,0,0,0.4)';

		const paddingX = 5;
		const paddingY = 3;
		const textWidth = textWidthCache.measure(context, data.label, {
			family: font,
			weight,
			style: labelStyle,
			size,
		});
		const width = textWidth + paddingX * 2;
		const height = size + paddingY * 2;
		drawNodeLabel(
			context,
			data,
			width,
			height,
			paddingX,
			getLabelPosition(),
			getLabelGap(size, getLabelOffset()),
			getLabelBackground(),
			getLabelColor(),
		);

		context.restore();
	};
}

export function createEdgeLabelDrawer(
	getRenderedLabelSize: (baseSize: number) => number,
	getOpacity: () => number,
	textWidthCache: CanvasTextWidthCache,
): EdgeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, edgeData, sourceData, targetData, settings) => {
		const label = edgeData.label;
		if (!label) return;
		const size = getRenderedLabelSize(settings.edgeLabelSize);
		const font = {
			family: settings.edgeLabelFont,
			weight: settings.edgeLabelWeight,
			size,
		};
		const sourceRadius = sourceData.size;
		const targetRadius = targetData.size;
		let sourceX = sourceData.x;
		let sourceY = sourceData.y;
		let targetX = targetData.x;
		let targetY = targetData.y;
		let deltaX = targetX - sourceX;
		let deltaY = targetY - sourceY;
		let distance = Math.hypot(deltaX, deltaY);
		if (distance < sourceRadius + targetRadius) return;
		sourceX += (deltaX * sourceRadius) / distance;
		sourceY += (deltaY * sourceRadius) / distance;
		targetX -= (deltaX * targetRadius) / distance;
		targetY -= (deltaY * targetRadius) / distance;
		deltaX = targetX - sourceX;
		deltaY = targetY - sourceY;
		distance = Math.hypot(deltaX, deltaY);
		const fitted = fitEdgeLabel(
			label,
			distance,
			(text) => textWidthCache.measure(context, text, font),
		);
		if (!fitted) return;
		const textWidth = textWidthCache.measure(context, fitted, font);
		const midpoint = {
			x: (sourceX + targetX) / 2,
			y: (sourceY + targetY) / 2,
		};
		let angle: number;
		if (deltaX > 0) {
			angle =
				deltaY > 0
					? Math.acos(deltaX / distance)
					: Math.asin(deltaY / distance);
		} else {
			angle =
				deltaY > 0
					? Math.acos(deltaX / distance) + Math.PI
					: Math.asin(deltaX / distance) + Math.PI / 2;
		}
		const attribute = settings.edgeLabelColor.attribute;
		const attributeColor = attribute
			? (edgeData as unknown as Record<string, unknown>)[attribute]
			: undefined;
		const color =
			(typeof attributeColor === 'string' ? attributeColor : undefined) ??
			settings.edgeLabelColor.color ??
			'#000';

		context.save();
		context.globalAlpha = getOpacity();
		context.translate(midpoint.x, midpoint.y);
		context.rotate(angle);
		context.font = `${settings.edgeLabelWeight} ${size}px ${settings.edgeLabelFont}`;
		context.fillStyle = color;
		context.fillText(fitted, -textWidth / 2, edgeData.size / 2 + size);
		context.restore();
	};
}

export function fitEdgeLabel(
	label: string,
	availableWidth: number,
	measure: (text: string) => number,
): string | undefined {
	if (measure(label) <= availableWidth) return label;
	let low = 0;
	let high = label.length;
	let fitted = '';
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const candidate = `${label.slice(0, middle)}…`;
		if (measure(candidate) <= availableWidth) {
			fitted = candidate;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	return fitted.length >= 4 ? fitted : undefined;
}

function drawNodeLabel(
	context: CanvasRenderingContext2D,
	data: Pick<NodeDisplayData, 'x' | 'y' | 'label' | 'size'> & {
		labelRotation?: number;
		labelDirection?: 1 | -1;
	},
	width: number,
	height: number,
	paddingX: number,
	labelPosition: LabelPosition,
	labelGap: number,
	labelBackground: string,
	labelColor: string,
): void {
	if (typeof data.label !== 'string') {
		return;
	}
	if (typeof data.labelRotation === 'number') {
		const direction = data.labelDirection ?? 1;
		const box = getRotatedNodeLabelBox(
			data.size,
			width,
			height,
			paddingX,
			labelGap,
			direction,
			labelPosition,
		);
		context.save();
		context.translate(data.x, data.y);
		context.rotate(data.labelRotation);
		context.textBaseline = 'middle';
		context.textAlign = box.textAlign;
		context.beginPath();
		drawRoundedRect(context, box.x, box.y, width, height, 4);
		context.fillStyle = labelBackground;
		context.fill();
		context.shadowBlur = 0;
		context.fillStyle = labelColor;
		context.fillText(data.label, box.textX, box.textY);
		context.restore();
		return;
	}

	const box = getNodeLabelBox(
		data.x,
		data.y,
		data.size,
		width,
		height,
		paddingX,
		labelPosition,
		labelGap,
	);
	context.textBaseline = 'middle';
	context.textAlign = box.textAlign;
	context.beginPath();
	drawRoundedRect(context, box.x, box.y, width, height, 4);
	context.fillStyle = labelBackground;
	context.fill();
	context.shadowBlur = 0;
	context.fillStyle = labelColor;
	context.fillText(data.label, box.textX, box.textY);
}

function getLabelGap(labelSize: number, labelOffset: number): number {
	return Math.max(0, labelSize * labelOffset * 0.5);
}

function drawRoundedRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	const right = x + width;
	const bottom = y + height;
	context.moveTo(x + radius, y);
	context.lineTo(right - radius, y);
	context.quadraticCurveTo(right, y, right, y + radius);
	context.lineTo(right, bottom - radius);
	context.quadraticCurveTo(right, bottom, right - radius, bottom);
	context.lineTo(x + radius, bottom);
	context.quadraticCurveTo(x, bottom, x, bottom - radius);
	context.lineTo(x, y + radius);
	context.quadraticCurveTo(x, y, x + radius, y);
	context.closePath();
}
