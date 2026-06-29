import type { ConnectionDragState } from '../../graph/graph-events';
import type { ViewportPoint } from './dom';
import { getDockDragKey } from './drag';
import type { DockDragPayload } from './types';

export function createDockConnectionDragState(
	payload: DockDragPayload,
	source: ViewportPoint,
	pointer: ViewportPoint,
): ConnectionDragState {
	return {
		sourceNodeId: getDockDragKey(payload),
		x1: source.x,
		y1: source.y,
		x2: pointer.x,
		y2: pointer.y,
	};
}

export function updateDockConnectionDragState(
	state: ConnectionDragState,
	pointer: ViewportPoint,
	targetNodeId: string | undefined,
): ConnectionDragState {
	return {
		...state,
		targetNodeId,
		x2: pointer.x,
		y2: pointer.y,
	};
}
