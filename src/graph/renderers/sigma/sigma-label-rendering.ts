import {
	drawStraightEdgeLabel,
	type NodeHoverDrawingFunction,
} from 'sigma/rendering';
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
	getScaledLabelSize,
} from './sigma-label-geometry';

export function createNodeLabelDrawer(
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelOffset: () => number,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (!data.label) {
			return;
		}

		const labelSize = getScaledLabelSize(settings.labelSize, data.size);
		const font = `${settings.labelWeight} ${labelSize}px ${settings.labelFont}`;
		const paddingX = 5;
		const paddingY = 3;
		context.save();
		context.font = font;
		context.textBaseline = 'middle';
		const textWidth = context.measureText(data.label).width;
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
	getOpacity: () => number,
	getLabelPosition: () => LabelPosition,
	getLabelOffset: () => number,
	getLabelColor: () => string,
	getLabelBackground: () => string,
): NodeHoverDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, data, settings) => {
		if (data.hidden) return;
		if (typeof data.label !== 'string') return;

		const { labelFont: font, labelWeight: weight } = settings;
		const size = getScaledLabelSize(settings.labelSize, data.size);
		context.font = `${weight} ${size}px ${font}`;

		context.save();
		context.globalAlpha = getOpacity();
		context.fillStyle = getLabelBackground();
		context.shadowOffsetX = 0;
		context.shadowOffsetY = 0;
		context.shadowBlur = 8;
		context.shadowColor = 'rgba(0,0,0,0.4)';

		const paddingX = 5;
		const paddingY = 3;
		const textWidth = context.measureText(data.label).width;
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
	getOpacity: () => number,
): EdgeLabelDrawingFunction<RuntimeNodeAttributes, RuntimeEdgeAttributes> {
	return (context, edgeData, sourceData, targetData, settings) => {
		context.save();
		context.globalAlpha = getOpacity();
		drawStraightEdgeLabel(
			context,
			edgeData,
			sourceData,
			targetData,
			settings,
		);
		context.restore();
	};
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
