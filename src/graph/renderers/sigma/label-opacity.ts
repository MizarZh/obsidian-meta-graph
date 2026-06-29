export function calculateLabelOpacity(
	fadeDistance: number,
	cameraRatio: number,
): number {
	const threshold = Math.max(0.01, fadeDistance);
	if (cameraRatio <= threshold) {
		return 1;
	}
	const fadeProgress = (cameraRatio - threshold) / 0.35;
	return Math.max(0, 1 - fadeProgress);
}
