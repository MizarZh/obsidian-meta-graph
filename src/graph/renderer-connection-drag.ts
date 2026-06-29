import type { ConnectionDragState } from './graph-events';
import type { ViewportPoint } from './renderer-hit-testing';

export interface ConnectionDragRenderer {
	getViewportPosition(event: MouseEvent | PointerEvent): ViewportPoint;
	getNodeAtViewportPosition(position: ViewportPoint): string | undefined;
	getNodeViewportPosition(nodeId: string): ViewportPoint | undefined;
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
