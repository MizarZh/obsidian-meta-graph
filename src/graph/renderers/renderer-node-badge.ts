import type { Camera, Scene, Sprite } from 'three';

export interface NodeBadgeAnchor {
	x: number;
	y: number;
	radius: number;
}

/** Project the sprite's visible footprint, including camera distance and parent scale. */
export function projectSpriteBadge(
	sprite: Sprite,
	camera: Camera,
	width: number,
	height: number,
): NodeBadgeAnchor | undefined {
	if (
		!sprite.visible ||
		sprite.material.opacity <= 0 ||
		width <= 0 ||
		height <= 0
	)
		return;
	sprite.updateWorldMatrix(true, false);
	camera.updateWorldMatrix(true, false);
	const world = sprite.getWorldPosition(sprite.position.clone());
	const center = world.clone().project(camera);
	if (center.z < -1 || center.z > 1) return;
	const scale = sprite.getWorldScale(sprite.scale.clone());
	const right = world
		.clone()
		.set(1, 0, 0)
		.transformDirection(camera.matrixWorld)
		.multiplyScalar(scale.x * 0.42);
	const edge = world.clone().add(right).project(camera);
	return {
		x: ((center.x + 1) * width) / 2,
		y: ((1 - center.y) * height) / 2,
		radius: (Math.abs(edge.x - center.x) * width) / 2,
	};
}

/** Run screen overlays in the same frame, after Three has updated and drawn the scene. */
export function onSceneBadgeFrame(
	scene: Scene,
	listener: () => void,
): () => void {
	const previous = scene.onAfterRender;
	const after: typeof previous = function (...args) {
		previous.apply(scene, args);
		listener();
	};
	scene.onAfterRender = after;
	return () => {
		if (scene.onAfterRender === after) scene.onAfterRender = previous;
	};
}
