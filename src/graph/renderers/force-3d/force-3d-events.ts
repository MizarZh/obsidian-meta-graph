import type { GraphEventCallbacks, ConnectionDragState } from '../renderer-events';
import type { Force3DRenderer } from './force-3d-renderer';
import {
	createConnectionDragState,
	getFinishedConnection,
	isConnectionDragStart,
	updateConnectionDragState,
} from '../renderer-interaction';

export function bindForce3DEvents(
	renderer: Force3DRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const instance = renderer.instance;
	const element = instance.renderer().domElement;
	let connectionDrag: ConnectionDragState | undefined;
	let suppressClickUntil = 0;
	let previousNavigationControls: boolean | undefined;
	let previousNodeDrag: boolean | undefined;
	instance
		.onNodeClick((node, event) => {
			if (Date.now() < suppressClickUntil) {
				event.preventDefault();
				return;
			}
			if (event.shiftKey) {
				event.preventDefault();
				renderer.togglePinnedHover(node.id);
				return;
			}
			if (event.ctrlKey) {
				event.preventDefault();
				callbacks.onSelect(node.id);
				return;
			}
			callbacks.onSelect(node.id);
			callbacks.onOpen(node.id);
		})
		.onNodeRightClick((node, event) => {
			event.preventDefault();
			callbacks.onSelect(node.id);
		})
		.onNodeHover((node) => {
			callbacks.onHover(node?.id);
		})
		.onBackgroundClick(() => {
			renderer.clearPinnedHover();
			callbacks.onSelect(undefined);
		});

	const pointerDown = (event: PointerEvent) => {
		if (!isConnectionDragStart(event)) {
			return;
		}
		const point = renderer.getViewportPosition(event);
		const sourceNodeId = renderer.getNodeAtViewportPosition(point);
		if (!sourceNodeId) {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		previousNavigationControls = instance.enableNavigationControls();
		previousNodeDrag = instance.enableNodeDrag();
		instance.enableNavigationControls(false);
		instance.enableNodeDrag(false);
		connectionDrag = createConnectionDragState(renderer, sourceNodeId, point);
		callbacks.onSelect(sourceNodeId);
		callbacks.onConnectionDrag?.(connectionDrag);
		window.addEventListener('pointermove', pointerMove, { capture: true });
		window.addEventListener('pointerup', pointerUp, { capture: true });
		window.addEventListener('pointercancel', pointerCancel, { capture: true });
	};

	const pointerMove = (event: PointerEvent) => {
		if (!connectionDrag) {
			return;
		}
		event.preventDefault();
		renderer.scheduleConnectionMove(updateConnectionDrag, event);
	};

	function updateConnectionDrag(event: PointerEvent): void {
		if (!connectionDrag) {
			return;
		}
		connectionDrag = updateConnectionDragState(renderer, connectionDrag, event);
		callbacks.onConnectionDrag?.(connectionDrag);
	}

	const pointerUp = (event: PointerEvent) => {
		if (!connectionDrag) {
			return;
		}
		event.preventDefault();
		const finished = getFinishedConnection(connectionDrag);
		endConnectionDrag(event.pointerId);
		if (finished) {
			callbacks.onConnect?.(finished.sourceNodeId, finished.targetNodeId);
		}
	};

	const pointerCancel = (event: PointerEvent) => {
		if (connectionDrag) {
			endConnectionDrag(event.pointerId);
		}
	};

	function endConnectionDrag(pointerId: number): void {
		connectionDrag = undefined;
		renderer.clearScheduledConnectionMove();
		suppressClickUntil = Date.now() + 500;
		if (previousNavigationControls !== undefined) {
			instance.enableNavigationControls(previousNavigationControls);
			previousNavigationControls = undefined;
		}
		if (previousNodeDrag !== undefined) {
			instance.enableNodeDrag(previousNodeDrag);
			previousNodeDrag = undefined;
		}
		void pointerId;
		window.removeEventListener('pointermove', pointerMove, { capture: true });
		window.removeEventListener('pointerup', pointerUp, { capture: true });
		window.removeEventListener('pointercancel', pointerCancel, {
			capture: true,
		});
		callbacks.onConnectionDrag?.(undefined);
	}

	element.addEventListener('pointerdown', pointerDown, { capture: true });
	return () => {
		if (connectionDrag) {
			callbacks.onConnectionDrag?.(undefined);
		}
		if (previousNavigationControls !== undefined) {
			instance.enableNavigationControls(previousNavigationControls);
			previousNavigationControls = undefined;
		}
		if (previousNodeDrag !== undefined) {
			instance.enableNodeDrag(previousNodeDrag);
			previousNodeDrag = undefined;
		}
		instance
			.onNodeClick(() => undefined)
			.onNodeRightClick(() => undefined)
			.onNodeHover(() => undefined)
			.onBackgroundClick(() => undefined);
		element.removeEventListener('pointerdown', pointerDown, { capture: true });
		window.removeEventListener('pointermove', pointerMove, { capture: true });
		window.removeEventListener('pointerup', pointerUp, { capture: true });
		window.removeEventListener('pointercancel', pointerCancel, {
			capture: true,
		});
	};
}
