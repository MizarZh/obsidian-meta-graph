import type * as Three from 'three';
import type { NodeShape } from '../../../core/types';
import type { RuntimeNodeAttributes } from '../../model/graphology-adapter';
import { createThreeTextSprite } from '../renderer-labels';
import type { ThreeModule } from './cube-three';

export function createCubeNodeSprite(
	three: Pick<ThreeModule, 'CanvasTexture' | 'Sprite' | 'SpriteMaterial'>,
	ownerDocument: Document,
	color: string,
	size: number,
	shape: NodeShape = 'circle',
): Three.Sprite {
	const canvasSize = 64;
	const canvas = ownerDocument.createElement('canvas');
	canvas.width = canvasSize;
	canvas.height = canvasSize;
	const context = canvas.getContext('2d');
	if (context) {
		context.clearRect(0, 0, canvasSize, canvasSize);
		context.fillStyle = '#ffffff';
		context.beginPath();
		if (shape === 'square') {
			const inset = canvasSize * 0.12;
			context.rect(
				inset,
				inset,
				canvasSize - inset * 2,
				canvasSize - inset * 2,
			);
		} else if (shape === 'diamond') {
			const center = canvasSize / 2;
			const radius = canvasSize * 0.42;
			context.moveTo(center, center - radius);
			context.lineTo(center + radius, center);
			context.lineTo(center, center + radius);
			context.lineTo(center - radius, center);
			context.closePath();
		} else if (shape === 'triangle') {
			drawRegularPolygon(context, canvasSize, 3, canvasSize * 0.42);
		} else if (shape === 'hexagon') {
			drawRegularPolygon(context, canvasSize, 6, canvasSize * 0.42);
		} else if (shape === 'star') {
			drawStar(context, canvasSize, canvasSize * 0.42, canvasSize * 0.19);
		} else {
			context.arc(
				canvasSize / 2,
				canvasSize / 2,
				canvasSize * 0.38,
				0,
				Math.PI * 2,
			);
		}
		context.fill();
	}
	const material = new three.SpriteMaterial({
		map: new three.CanvasTexture(canvas),
		color,
		transparent: true,
		depthWrite: false,
		depthTest: false,
	});
	const sprite = new three.Sprite(material);
	sprite.scale.set(size * 2, size * 2, 1);
	return sprite;
}

function drawRegularPolygon(
	context: CanvasRenderingContext2D,
	canvasSize: number,
	sides: number,
	radius: number,
): void {
	const center = canvasSize / 2;
	for (let index = 0; index < sides; index += 1) {
		const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
		const x = center + Math.cos(angle) * radius;
		const y = center + Math.sin(angle) * radius;
		if (index === 0) {
			context.moveTo(x, y);
		} else {
			context.lineTo(x, y);
		}
	}
	context.closePath();
}

function drawStar(
	context: CanvasRenderingContext2D,
	canvasSize: number,
	outerRadius: number,
	innerRadius: number,
): void {
	const center = canvasSize / 2;
	for (let index = 0; index < 10; index += 1) {
		const radius = index % 2 === 0 ? outerRadius : innerRadius;
		const angle = -Math.PI / 2 + (index * Math.PI) / 5;
		const x = center + Math.cos(angle) * radius;
		const y = center + Math.sin(angle) * radius;
		if (index === 0) {
			context.moveTo(x, y);
		} else {
			context.lineTo(x, y);
		}
	}
	context.closePath();
}

export function createCubeArrowTexture(
	three: Pick<ThreeModule, 'CanvasTexture'>,
	ownerDocument: Document,
	color: string,
): Three.CanvasTexture {
	const canvasSize = 64;
	const canvas = ownerDocument.createElement('canvas');
	canvas.width = canvasSize;
	canvas.height = canvasSize;
	const context = canvas.getContext('2d');
	if (context) {
		context.clearRect(0, 0, canvasSize, canvasSize);
		context.fillStyle = color;
		context.beginPath();
		context.moveTo(52, 32);
		context.lineTo(22, 14);
		context.lineTo(28, 32);
		context.lineTo(22, 50);
		context.closePath();
		context.fill();
	}
	return new three.CanvasTexture(canvas);
}

export function createCubeTextSprite(
	three: ThreeModule,
	ownerDocument: Document,
	text: string,
	size: number,
	attributes: RuntimeNodeAttributes,
	textColor: string,
	backgroundColor: string,
): Three.Sprite {
	const fontSize = Math.max(10, size);
	const padding = Math.ceil(fontSize * 0.45);
	return createThreeTextSprite(three, {
		text,
		fontSize,
		textColor,
		backgroundColor,
		ownerDocument,
		paddingX: padding,
		paddingY: padding,
		scale: attributes.isPrimary ? 1.1 : 1,
		scaleMultiplier: 0.28,
	});
}
