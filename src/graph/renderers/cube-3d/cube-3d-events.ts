import type { Cube3DRenderer } from './cube-3d-renderer';
import type { ConnectionDragState, GraphEventCallbacks } from '../renderer-events';
import {
	createConnectionDragState,
	getFinishedConnection,
	isConnectionDragStart,
	updateConnectionDragState,
} from '../renderer-interaction';

export function bindCube3DEvents(
	renderer: Cube3DRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const element = renderer.element;
	let connectionDrag: ConnectionDragState | undefined;
	let draggedNodeId: string | undefined;
	let draggedNodeMoved = false;
	let rotating = false;
	let rotated = false;
	let panning = false;
	let panned = false;
	let lastPointer: { x: number; y: number } | undefined;
	let suppressClickUntil = 0;
	let suppressContextMenuUntil = 0;

	const pointerDown = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		const nodeId = renderer.getNodeAtViewportPosition(point);
		lastPointer = { x: event.clientX, y: event.clientY };
		if (isConnectionDragStart(event) && nodeId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			connectionDrag = createConnectionDragState(renderer, nodeId, point);
			callbacks.onSelect(nodeId);
			callbacks.onConnectionDrag?.(connectionDrag);
			window.addEventListener('pointermove', pointerMove, { capture: true });
			window.addEventListener('pointerup', pointerUp, { capture: true });
			window.addEventListener('pointercancel', pointerCancel, { capture: true });
			return;
		}
		if (event.button === 2) {
			event.preventDefault();
			event.stopImmediatePropagation();
			panning = true;
			panned = false;
			window.addEventListener('pointermove', pointerMove, { capture: true });
			window.addEventListener('pointerup', pointerUp, { capture: true });
			window.addEventListener('pointercancel', pointerCancel, { capture: true });
			return;
		}
		if (event.button !== 0) {
			return;
		}
		event.preventDefault();
		if (nodeId) {
			draggedNodeId = nodeId;
			draggedNodeMoved = false;
			callbacks.onSelect(nodeId);
		} else {
			rotating = true;
			rotated = false;
		}
		window.addEventListener('pointermove', pointerMove, { capture: true });
		window.addEventListener('pointerup', pointerUp, { capture: true });
		window.addEventListener('pointercancel', pointerCancel, { capture: true });
	};

	const pointerMove = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		if (connectionDrag) {
			event.preventDefault();
			event.stopImmediatePropagation();
			connectionDrag = updateConnectionDragState(renderer, connectionDrag, event);
			callbacks.onConnectionDrag?.(connectionDrag);
			return;
		}
		if (draggedNodeId) {
			event.preventDefault();
			event.stopImmediatePropagation();
			const position = renderer.dragNodeToViewport(draggedNodeId, point);
			if (position) {
				draggedNodeMoved = true;
				callbacks.onNodeDrag?.(draggedNodeId, position);
			}
			return;
		}
		if (rotating && lastPointer) {
			event.preventDefault();
			event.stopImmediatePropagation();
			renderer.rotate(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
			lastPointer = { x: event.clientX, y: event.clientY };
			rotated = true;
			return;
		}
		if (panning && lastPointer) {
			event.preventDefault();
			event.stopImmediatePropagation();
			renderer.pan(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
			lastPointer = { x: event.clientX, y: event.clientY };
			panned = true;
			return;
		}
		callbacks.onHover(renderer.getNodeAtViewportPosition(point));
	};

	const pointerUp = (event: PointerEvent) => {
		const point = renderer.getViewportPosition(event);
		const nodeId = renderer.getNodeAtViewportPosition(point);
		if (connectionDrag) {
			event.preventDefault();
			const finished = getFinishedConnection(connectionDrag);
			endPointerState();
			if (finished) {
				callbacks.onConnect?.(finished.sourceNodeId, finished.targetNodeId);
			}
			return;
		}
		if (draggedNodeId) {
			event.preventDefault();
			const finishedNodeId = draggedNodeId;
			const moved = draggedNodeMoved;
			endPointerState();
			callbacks.onNodeDragEnd?.(finishedNodeId);
			if (!moved && Date.now() >= suppressClickUntil) {
				if (event.shiftKey) {
					renderer.togglePinnedHover(finishedNodeId);
				} else {
					callbacks.onSelect(finishedNodeId);
					callbacks.onOpen(finishedNodeId);
				}
			}
			suppressClickUntil = moved ? Date.now() + 500 : 0;
			return;
		}
		if (rotating) {
			event.preventDefault();
			const moved = rotated;
			endPointerState();
			if (!moved) {
				renderer.clearPinnedHover();
				callbacks.onSelect(undefined);
			}
			return;
		}
		if (panning) {
			event.preventDefault();
			const moved = panned;
			endPointerState();
			suppressContextMenuUntil = moved ? Date.now() + 500 : 0;
			return;
		}
		if (!nodeId) {
			renderer.clearPinnedHover();
			callbacks.onSelect(undefined);
		}
	};

	const pointerCancel = () => {
		endPointerState();
	};

	const wheel = (event: WheelEvent) => {
		event.preventDefault();
		renderer.zoom(event.deltaY);
	};

	const contextMenu = (event: MouseEvent) => {
		if (Date.now() < suppressContextMenuUntil) {
			event.preventDefault();
			return;
		}
		const nodeId = renderer.getNodeAtViewportPosition(
			renderer.getViewportPosition(event),
		);
		event.preventDefault();
		if (!nodeId) {
			return;
		}
		callbacks.onSelect(nodeId);
	};

	function endPointerState(): void {
		if (connectionDrag) {
			callbacks.onConnectionDrag?.(undefined);
		}
		connectionDrag = undefined;
		draggedNodeId = undefined;
		draggedNodeMoved = false;
		rotating = false;
		rotated = false;
		panning = false;
		panned = false;
		lastPointer = undefined;
		window.removeEventListener('pointermove', pointerMove, { capture: true });
		window.removeEventListener('pointerup', pointerUp, { capture: true });
		window.removeEventListener('pointercancel', pointerCancel, { capture: true });
	}

	element.addEventListener('pointerdown', pointerDown, { capture: true });
	element.addEventListener('pointermove', pointerMove);
	element.addEventListener('wheel', wheel, { passive: false });
	element.addEventListener('contextmenu', contextMenu);

	return () => {
		endPointerState();
		element.removeEventListener('pointerdown', pointerDown, { capture: true });
		element.removeEventListener('pointermove', pointerMove);
		element.removeEventListener('wheel', wheel);
		element.removeEventListener('contextmenu', contextMenu);
	};
}
