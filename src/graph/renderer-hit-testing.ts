export interface ViewportPoint {
	x: number;
	y: number;
}

export interface ScreenNode extends ViewportPoint {
	id: string;
	size: number;
}

export function readViewportPosition(
	container: HTMLElement,
	event: MouseEvent | PointerEvent,
): ViewportPoint {
	const rect = container.getBoundingClientRect();
	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	};
}

export function projectedToViewport(
	projected: ViewportPoint,
	bounds: { width: number; height: number },
): ViewportPoint {
	return {
		x: ((projected.x + 1) / 2) * bounds.width,
		y: ((1 - projected.y) / 2) * bounds.height,
	};
}

export function findClosestScreenNode(
	nodes: ScreenNode[],
	position: ViewportPoint,
	getHitRadius: (node: ScreenNode) => number,
): string | undefined {
	let closestNodeId: string | undefined;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (const node of nodes) {
		const distance = Math.hypot(node.x - position.x, node.y - position.y);
		if (distance <= getHitRadius(node) && distance < closestDistance) {
			closestDistance = distance;
			closestNodeId = node.id;
		}
	}
	return closestNodeId;
}
