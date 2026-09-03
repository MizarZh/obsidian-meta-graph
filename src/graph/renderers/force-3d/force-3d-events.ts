import type {
	GraphEventCallbacks,
	ConnectionDragState,
} from '../renderer-events';
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
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				callbacks.onSelect(node.id);
				return;
			}
			callbacks.onSelect(node.id);
		})
		.onNodeRightClick((node, event) => {
			event.preventDefault();
			callbacks.onSelect(node.id);
			callbacks.onContextMenu?.(
				{ kind: 'node', nodeId: node.id },
				event,
			);
		})
		.onLinkRightClick((link, event) => {
			event.preventDefault();
			callbacks.onSelectEdge?.(link.id);
			callbacks.onContextMenu?.(
				{ kind: 'edge', edgeId: link.id },
				event,
			);
		})
		.onNodeHover((node) => {
			callbacks.onHover(node?.id);
		})
		.onBackgroundClick(() => {
			renderer.clearPinnedHover();
			callbacks.onSelect(undefined);
		})
		.onBackgroundRightClick((event) => {
			event.preventDefault();
			callbacks.onSelect(undefined);
			callbacks.onContextMenu?.({ kind: 'stage' }, event);
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
		connectionDrag = createConnectionDragState(
			renderer,
			sourceNodeId,
			point,
		);
		callbacks.onSelect(sourceNodeId);
		callbacks.onConnectionDrag?.(connectionDrag);
		window.addEventListener('pointermove', pointerMove, { capture: true });
		window.addEventListener('pointerup', pointerUp, { capture: true });
		window.addEventListener('pointercancel', pointerCancel, {
			capture: true,
		});
	};
	const doubleClick = (event: MouseEvent) => {
		const nodeId = renderer.getNodeAtViewportPosition(
			renderer.getViewportPosition(event),
		);
		if (!nodeId) return;
		event.preventDefault();
		callbacks.onSelect(nodeId);
		callbacks.onOpen(nodeId);
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
		connectionDrag = updateConnectionDragState(
			renderer,
			connectionDrag,
			event,
		);
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
		window.removeEventListener('pointermove', pointerMove, {
			capture: true,
		});
		window.removeEventListener('pointerup', pointerUp, { capture: true });
		window.removeEventListener('pointercancel', pointerCancel, {
			capture: true,
		});
		callbacks.onConnectionDrag?.(undefined);
	}

	element.addEventListener('pointerdown', pointerDown, { capture: true });
	element.addEventListener('dblclick', doubleClick);
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
			.onLinkRightClick(() => undefined)
			.onNodeHover(() => undefined)
			.onBackgroundClick(() => undefined)
			.onBackgroundRightClick(() => undefined);
		element.removeEventListener('pointerdown', pointerDown, {
			capture: true,
		});
		element.removeEventListener('dblclick', doubleClick);
		window.removeEventListener('pointermove', pointerMove, {
			capture: true,
		});
		window.removeEventListener('pointerup', pointerUp, { capture: true });
		window.removeEventListener('pointercancel', pointerCancel, {
			capture: true,
		});
	};
}
