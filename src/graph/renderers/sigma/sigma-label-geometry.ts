import type { LabelPosition } from '../../../core/types';

const DEFAULT_NODE_LABEL_BASE_SIZE = 7;

export function getRotatedNodeLabelBox(
	nodeSize: number,
	width: number,
	height: number,
	paddingX: number,
	gap: number,
	direction: 1 | -1,
	position: LabelPosition,
): {
	x: number;
	y: number;
	textX: number;
	textY: number;
	textAlign: CanvasTextAlign;
} {
	const outward = direction > 0 ? 1 : -1;
	if (position === 'left') {
		const x = outward > 0 ? -nodeSize - gap - width : nodeSize + gap;
		return {
			x,
			y: -height / 2,
			textX: x + (outward > 0 ? width - paddingX : paddingX),
			textY: 0,
			textAlign: outward > 0 ? 'right' : 'left',
		};
	}
	if (position === 'top') {
		return {
			x: -width / 2,
			y: -nodeSize - gap - height,
			textX: 0,
			textY: -nodeSize - gap - height / 2,
			textAlign: 'center',
		};
	}
	if (position === 'bottom') {
		return {
			x: -width / 2,
			y: nodeSize + gap,
			textX: 0,
			textY: nodeSize + gap + height / 2,
			textAlign: 'center',
		};
	}
	const x = outward > 0 ? nodeSize + gap : -nodeSize - gap - width;
	return {
		x,
		y: -height / 2,
		textX: x + (outward > 0 ? paddingX : width - paddingX),
		textY: 0,
		textAlign: outward > 0 ? 'left' : 'right',
	};
}

export function getScaledLabelSize(baseLabelSize: number, nodeSize: number): number {
	return (baseLabelSize * nodeSize) / DEFAULT_NODE_LABEL_BASE_SIZE;
}

export function getNodeLabelBox(
	nodeX: number,
	nodeY: number,
	nodeSize: number,
	width: number,
	height: number,
	paddingX: number,
	position: LabelPosition,
): {
	x: number;
	y: number;
	textX: number;
	textY: number;
	textAlign: CanvasTextAlign;
} {
	const gap = 5;
	if (position === 'left') {
		const textX = nodeX - nodeSize - gap;
		return {
			x: textX - width + paddingX,
			y: nodeY - height / 2,
			textX,
			textY: nodeY,
			textAlign: 'right',
		};
	}
	if (position === 'top') {
		const y = nodeY - nodeSize - gap - height;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: 'center',
		};
	}
	if (position === 'bottom') {
		const y = nodeY + nodeSize + gap;
		return {
			x: nodeX - width / 2,
			y,
			textX: nodeX,
			textY: y + height / 2,
			textAlign: 'center',
		};
	}
	const textX = nodeX + nodeSize + gap;
	return {
		x: textX - paddingX,
		y: nodeY - height / 2,
		textX,
		textY: nodeY,
		textAlign: 'left',
	};
}
