import type * as Three from 'three';
import type { CubeFace } from './cube-faces';

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, amount: number): number {
	return start + (end - start) * amount;
}

export function smoothstep(
	edge0: number,
	edge1: number,
	value: number,
): number {
	const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return amount * amount * (3 - 2 * amount);
}

export function getCubeLocalPosition(
	face: CubeFace,
	cubeSize: number,
	x: number,
	y: number,
	offset = 6,
): Three.Vector3 {
	const range = cubeSize * 0.78;
	return face.normal
		.clone()
		.multiplyScalar(cubeSize + offset)
		.add(face.u.clone().multiplyScalar(clamp(x, -1, 1) * range))
		.add(face.v.clone().multiplyScalar(clamp(y, -1, 1) * range));
}

export function getCubeLocalLabelPosition(
	face: CubeFace,
	cubeSize: number,
	x: number,
	y: number,
	nodeRadius: number,
	labelSize: number,
): Three.Vector3 {
	return getCubeLocalPosition(face, cubeSize, x, y, 10).add(
		face.v.clone().multiplyScalar(nodeRadius + labelSize * 0.9),
	);
}

export function getFaceVisibilityOpacity(
	face: CubeFace,
	localPosition: Three.Vector3,
	cubeGroup: Three.Group,
	camera: Three.PerspectiveCamera,
): number {
	const worldNormal = face.normal
		.clone()
		.transformDirection(cubeGroup.matrixWorld)
		.normalize();
	const worldPosition = cubeGroup.localToWorld(localPosition.clone());
	const toCamera = camera.position.clone().sub(worldPosition).normalize();
	const facing = worldNormal.dot(toCamera);
	return lerp(0.62, 1, smoothstep(-0.2, 0.35, facing));
}
