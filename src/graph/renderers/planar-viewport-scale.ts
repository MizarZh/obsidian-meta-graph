import type { RuntimeGraph } from '@/graph/model/graphology-adapter';

export const MIN_PLANAR_ZOOM_LEVEL = 25;
export const MAX_PLANAR_ZOOM_LEVEL = 400;
export const PLANAR_STAGE_PADDING = 30;
export const PLANAR_WHEEL_ZOOM_FACTOR = 1.2;

export interface PlanarGraphExtent {
	x: [number, number];
	y: [number, number];
	center: { x: number; y: number };
	normalizationRatio: number;
}

export interface PlanarViewportState {
	zoomLevel: number;
	normalizedCenter: { x: number; y: number };
}

export function getPlanarGraphExtent(graph: RuntimeGraph): PlanarGraphExtent {
	if (graph.order === 0) {
		return {
			x: [0, 1],
			y: [0, 1],
			center: { x: 0.5, y: 0.5 },
			normalizationRatio: 1,
		};
	}
	let xMin = Number.POSITIVE_INFINITY;
	let xMax = Number.NEGATIVE_INFINITY;
	let yMin = Number.POSITIVE_INFINITY;
	let yMax = Number.NEGATIVE_INFINITY;
	graph.forEachNode((_nodeId, attributes) => {
		xMin = Math.min(xMin, attributes.x);
		xMax = Math.max(xMax, attributes.x);
		yMin = Math.min(yMin, attributes.y);
		yMax = Math.max(yMax, attributes.y);
	});
	const normalizationRatio = Math.max(xMax - xMin, yMax - yMin) || 1;
	return {
		x: [xMin, xMax],
		y: [yMin, yMax],
		center: { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 },
		normalizationRatio,
	};
}

/** Reproduces Sigma's ratio-1 coordinate transform in G6 native zoom units. */
export function calculateSigmaCompatibleFitZoom(
	extent: PlanarGraphExtent,
	viewport: { width: number; height: number },
	padding = PLANAR_STAGE_PADDING,
): number {
	const { width, height } = viewport;
	if (!(width > 0) || !(height > 0)) return 1;
	const graphWidth = extent.x[1] - extent.x[0] || 1;
	const graphHeight = extent.y[1] - extent.y[0] || 1;
	const viewportRatio = height / width;
	const graphRatio = graphHeight / graphWidth;
	const oppositeOrientations =
		(viewportRatio < 1 && graphRatio > 1) ||
		(viewportRatio > 1 && graphRatio < 1);
	const correctionRatio = oppositeOrientations
		? 1
		: Math.min(
				Math.max(graphRatio, 1 / graphRatio),
				Math.max(1 / viewportRatio, viewportRatio),
			);
	const availableSize = Math.max(1, Math.min(width, height) - 2 * padding);
	return normalizePlanarFitZoom(
		(availableSize * correctionRatio) / extent.normalizationRatio,
	);
}

export function normalizePlanarPosition(
	position: { x: number; y: number },
	extent: PlanarGraphExtent,
): { x: number; y: number } {
	return {
		x: 0.5 + (position.x - extent.center.x) / extent.normalizationRatio,
		y: 0.5 + (position.y - extent.center.y) / extent.normalizationRatio,
	};
}

export function denormalizePlanarPosition(
	position: { x: number; y: number },
	extent: PlanarGraphExtent,
): { x: number; y: number } {
	return {
		x: extent.center.x + extent.normalizationRatio * (position.x - 0.5),
		y: extent.center.y + extent.normalizationRatio * (position.y - 0.5),
	};
}

export function normalizePlanarFitZoom(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

export function nativeZoomToPlanarLevel(
	nativeZoom: number,
	fitZoom: number,
): number {
	return (
		(normalizePlanarFitZoom(nativeZoom) / normalizePlanarFitZoom(fitZoom)) *
		100
	);
}

export function planarLevelToNativeZoom(
	level: number,
	fitZoom: number,
): number {
	const normalizedLevel = Number.isFinite(level)
		? Math.min(
				MAX_PLANAR_ZOOM_LEVEL,
				Math.max(MIN_PLANAR_ZOOM_LEVEL, level),
			)
		: 100;
	return normalizePlanarFitZoom(fitZoom) * (normalizedLevel / 100);
}

export function getPlanarNativeZoomRange(fitZoom: number): [number, number] {
	return [
		planarLevelToNativeZoom(MIN_PLANAR_ZOOM_LEVEL, fitZoom),
		planarLevelToNativeZoom(MAX_PLANAR_ZOOM_LEVEL, fitZoom),
	];
}

/** Keeps node and edge geometry in physical graph scale across planar renderers. */
export function getPlanarVisualScale(level: number): number {
	const normalizedLevel = Number.isFinite(level) && level > 0 ? level : 100;
	return normalizedLevel / 100;
}

/** Keeps zoomed labels readable while geometry follows physical graph scale. */
export function getPlanarLabelVisualScale(level: number): number {
	const normalizedLevel = Number.isFinite(level) && level > 0 ? level : 100;
	return Math.sqrt(normalizedLevel / 100);
}

/** Sigma camera-ratio equivalent of the shared linear physical-size policy. */
export function planarZoomToSizeRatio(cameraRatio: number): number {
	return Number.isFinite(cameraRatio) && cameraRatio > 0 ? cameraRatio : 1;
}
