import type { ConnectionDragState } from '@/graph/renderers/renderer-events';
import type { ViewportPoint } from '@/ui/dock/dom';
import { getDockDragKey } from '@/ui/dock/drag';
import type { DockDragPayload } from '@/ui/dock/types';

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
