import { Color, WebGLRenderer, type Scene, type Camera } from 'three';

/** Synchronous capture: no animation tick can interleave with the snapshot. */
export function captureThreeScene(
	scene: Scene,
	camera: Camera,
	document: Document,
	width: number,
	height: number,
	scale: number,
	background?: string,
): HTMLCanvasElement {
	const output = document.createElement('canvas');
	output.width = Math.round(width * scale);
	output.height = Math.round(height * scale);
	const context = output.getContext('2d');
	if (!context) throw new Error('Canvas is unavailable');
	const renderer = new WebGLRenderer({
		canvas: document.createElement('canvas'),
		alpha: true,
		antialias: true,
	});
	const previousBackground = scene.background;
	try {
		renderer.setPixelRatio(scale);
		renderer.setSize(width, height, false);
		scene.background = background ? new Color(background) : null;
		renderer.render(scene, camera);
		context.drawImage(renderer.domElement, 0, 0);
		return output;
	} finally {
		scene.background = previousBackground;
		renderer.dispose();
		renderer.forceContextLoss();
	}
}
