import type * as Three from 'three';

export interface ThreeLabelRuntime {
	CanvasTexture: typeof Three.CanvasTexture;
	Sprite: typeof Three.Sprite;
	SpriteMaterial: typeof Three.SpriteMaterial;
}

export interface ThreeTextSpriteOptions {
	text: string;
	fontSize: number;
	textColor: string;
	backgroundColor: string;
	ownerDocument: Document;
	paddingX?: number;
	paddingY?: number;
	scale?: number;
	scaleMultiplier?: number;
	roundRadius?: number;
}

export function createThreeTextSprite(
	three: ThreeLabelRuntime,
	options: ThreeTextSpriteOptions,
): Three.Sprite {
	const fontSize = Math.max(1, options.fontSize);
	const paddingX = options.paddingX ?? Math.max(8, Math.round(fontSize * 0.55));
	const paddingY = options.paddingY ?? Math.max(4, Math.round(fontSize * 0.32));
	const canvas = options.ownerDocument.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) {
		return new three.Sprite(
			new three.SpriteMaterial({
				map: new three.CanvasTexture(canvas),
				transparent: true,
				depthWrite: false,
				depthTest: false,
			}),
		);
	}

	context.font = `${fontSize}px sans-serif`;
	const width = Math.max(
		1,
		Math.ceil(context.measureText(options.text).width + paddingX * 2),
	);
	const height = Math.max(1, Math.ceil(fontSize + paddingY * 2));
	const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
	canvas.width = width * pixelRatio;
	canvas.height = height * pixelRatio;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
	context.scale(pixelRatio, pixelRatio);
	context.font = `${fontSize}px sans-serif`;
	context.textBaseline = 'middle';
	context.fillStyle = options.backgroundColor;
	const radius = options.roundRadius ?? 0;
	if (radius > 0) {
		drawRoundRect(context, 0, 0, width, height, radius);
		context.fill();
	} else {
		context.fillRect(0, 0, width, height);
	}
	context.fillStyle = options.textColor;
	context.fillText(options.text, paddingX, height / 2);

	const texture = new three.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const material = new three.SpriteMaterial({
		map: texture,
		transparent: true,
		depthWrite: false,
		depthTest: false,
	});
	const sprite = new three.Sprite(material);
	const scale = options.scale ?? 1;
	const scaleMultiplier = options.scaleMultiplier ?? 0.24;
	sprite.scale.set(width * scaleMultiplier * scale, height * scaleMultiplier * scale, 1);
	return sprite;
}

export function drawRoundRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	const normalizedRadius = Math.min(radius, width / 2, height / 2);
	context.beginPath();
	context.moveTo(x + normalizedRadius, y);
	context.lineTo(x + width - normalizedRadius, y);
	context.quadraticCurveTo(x + width, y, x + width, y + normalizedRadius);
	context.lineTo(x + width, y + height - normalizedRadius);
	context.quadraticCurveTo(
		x + width,
		y + height,
		x + width - normalizedRadius,
		y + height,
	);
	context.lineTo(x + normalizedRadius, y + height);
	context.quadraticCurveTo(x, y + height, x, y + height - normalizedRadius);
	context.lineTo(x, y + normalizedRadius);
	context.quadraticCurveTo(x, y, x + normalizedRadius, y);
	context.closePath();
}
