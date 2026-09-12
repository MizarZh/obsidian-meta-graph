export interface MinimapPoint {
	x: number;
	y: number;
}

export function minimapWheelZoom(level: number, deltaY: number, deltaMode: number): number {
	if (!Number.isFinite(deltaY)) return level;
	const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 120 : 1);
	return Math.max(25, Math.min(400, level * Math.exp(-Math.max(-500, Math.min(500, pixels)) * 0.002)));
}

export function createMinimapTransform(
	points: readonly MinimapPoint[],
	width: number,
	height: number,
	padding = 10,
) {
	const valid = points.filter(
		(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
	);
	if (!valid.length) return undefined;
	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;
	for (const p of valid) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	}
	const scale = Math.min(
		(width - 2 * padding) / Math.max(maxX - minX, 1),
		(height - 2 * padding) / Math.max(maxY - minY, 1),
	);
	const cx = (minX + maxX) / 2,
		cy = (minY + maxY) / 2;
	const project = (p: MinimapPoint): MinimapPoint => ({
		x: width / 2 + (p.x - cx) * scale,
		y: height / 2 - (p.y - cy) * scale,
	});
	return Object.assign(project, {
		invert: (p: MinimapPoint): MinimapPoint => ({
			x: cx + (p.x - width / 2) / scale,
			y: cy - (p.y - height / 2) / scale,
		}),
	});
}
