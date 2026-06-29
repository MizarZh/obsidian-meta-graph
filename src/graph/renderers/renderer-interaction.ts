import type { ConnectionDragState } from './renderer-events';

export interface ViewportPoint {
	x: number;
	y: number;
}

export interface ScreenNode extends ViewportPoint {
	id: string;
	size: number;
}

export interface ConnectionDragRenderer {
	getViewportPosition(event: MouseEvent | PointerEvent): ViewportPoint;
	getNodeAtViewportPosition(position: ViewportPoint): string | undefined;
	getNodeViewportPosition(nodeId: string): ViewportPoint | undefined;
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

export function isConnectionDragStart(event: PointerEvent): boolean {
	return event.ctrlKey && event.button === 0;
}

export function createConnectionDragState(
	renderer: ConnectionDragRenderer,
	sourceNodeId: string,
	point: ViewportPoint,
): ConnectionDragState {
	const source = renderer.getNodeViewportPosition(sourceNodeId) ?? point;
	return {
		sourceNodeId,
		x1: source.x,
		y1: source.y,
		x2: point.x,
		y2: point.y,
	};
}

export function updateConnectionDragState(
	renderer: ConnectionDragRenderer,
	state: ConnectionDragState,
	event: PointerEvent,
): ConnectionDragState {
	const point = renderer.getViewportPosition(event);
	const targetNodeId = renderer.getNodeAtViewportPosition(point);
	return {
		...state,
		targetNodeId:
			targetNodeId && targetNodeId !== state.sourceNodeId
				? targetNodeId
				: undefined,
		x2: point.x,
		y2: point.y,
	};
}

export function getFinishedConnection(
	state: ConnectionDragState,
): { sourceNodeId: string; targetNodeId: string } | undefined {
	return state.targetNodeId && state.targetNodeId !== state.sourceNodeId
		? {
				sourceNodeId: state.sourceNodeId,
				targetNodeId: state.targetNodeId,
			}
		: undefined;
}
