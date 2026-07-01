export interface MultiDragOrderOptions {
	orderedPaths: string[];
	draggedPath: string;
	selectedPaths: ReadonlySet<string>;
	singleDraggedOrder: string[];
}

export function buildCuratedMultiDragOrder({
	orderedPaths,
	draggedPath,
	selectedPaths,
	singleDraggedOrder,
}: MultiDragOrderOptions): string[] {
	if (!selectedPaths.has(draggedPath) || selectedPaths.size <= 1) {
		return singleDraggedOrder;
	}
	const originalSet = new Set(orderedPaths);
	if (
		originalSet.size !== orderedPaths.length ||
		singleDraggedOrder.length !== orderedPaths.length ||
		singleDraggedOrder.some((path) => !originalSet.has(path))
	) {
		return orderedPaths;
	}
	const moving = orderedPaths.filter((path) => selectedPaths.has(path));
	const movingSet = new Set(moving);
	const remaining = orderedPaths.filter((path) => !movingSet.has(path));
	const singleRemainingOrder = singleDraggedOrder.filter(
		(path) => !movingSet.has(path),
	);
	const insertIndex = findInsertIndex(
		remaining,
		singleRemainingOrder,
		draggedPath,
		singleDraggedOrder,
	);
	return [
		...remaining.slice(0, insertIndex),
		...moving,
		...remaining.slice(insertIndex),
	];
}

function findInsertIndex(
	remaining: string[],
	singleRemainingOrder: string[],
	draggedPath: string,
	singleDraggedOrder: string[],
): number {
	const draggedIndex = singleDraggedOrder.indexOf(draggedPath);
	const nextRemaining = singleDraggedOrder
		.slice(draggedIndex + 1)
		.find((path) => remaining.includes(path));
	if (nextRemaining) {
		const index = singleRemainingOrder.indexOf(nextRemaining);
		return index >= 0 ? index : remaining.length;
	}
	return remaining.length;
}
