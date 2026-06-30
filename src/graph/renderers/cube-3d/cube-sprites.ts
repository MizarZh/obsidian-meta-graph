import type * as Three from 'three';
import type { RuntimeNodeAttributes } from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';
import { createThreeTextSprite } from '../renderer-labels';
import type { ThreeModule } from './cube-three';

export function createCubeNodeSprite(
	three: Pick<ThreeModule, 'CanvasTexture' | 'Sprite' | 'SpriteMaterial'>,
	ownerDocument: Document,
	color: string,
	size: number,
): Three.Sprite {
	const canvasSize = 64;
	const canvas = ownerDocument.createElement('canvas');
	canvas.width = canvasSize;
	canvas.height = canvasSize;
	const context = canvas.getContext('2d');
	if (context) {
		context.clearRect(0, 0, canvasSize, canvasSize);
		context.fillStyle = color;
		context.beginPath();
		context.arc(
			canvasSize / 2,
			canvasSize / 2,
			canvasSize * 0.38,
			0,
			Math.PI * 2,
		);
		context.fill();
	}
	const material = new three.SpriteMaterial({
		map: new three.CanvasTexture(canvas),
		transparent: true,
		depthWrite: false,
		depthTest: false,
	});
	const sprite = new three.Sprite(material);
	sprite.scale.set(size * 2, size * 2, 1);
	return sprite;
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
	palette: GraphPalette,
	labelColor: string,
	labelBackgroundOpacity: number,
): Three.Sprite {
	const fontSize = Math.max(10, size);
	const padding = Math.ceil(fontSize * 0.45);
	return createThreeTextSprite(three, {
		text,
		fontSize,
		textColor: labelColor || palette.label,
		backgroundColor: `rgba(0, 0, 0, ${labelBackgroundOpacity})`,
		ownerDocument,
		paddingX: padding,
		paddingY: padding,
		scale: attributes.isPrimary ? 1.1 : 1,
		scaleMultiplier: 0.28,
	});
}
