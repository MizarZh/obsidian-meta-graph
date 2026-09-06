import {
	CanvasEvent,
	CommonEvent,
	EdgeEvent,
	NodeEvent,
	type IDragEvent,
	type IElementEvent,
	type IPointerEvent,
} from '@antv/g6';
import type {
	ConnectionDragState,
	GraphEventCallbacks,
} from '../renderer-events';
import type { G6Renderer } from './g6-renderer';

const CLICK_SUPPRESSION_MS = 500;

export function bindG6Events(
	renderer: G6Renderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const graph = renderer.instance;
	let connectionDrag: ConnectionDragState | undefined;
	let hoveredEdgeId: string | undefined;
	let viewportDragging = false;
	let nodeDrag:
		| {
				id: string;
				offsetX: number;
				offsetY: number;
				moved: boolean;
				start: { x: number; y: number };
		  }
		| undefined;
	let suppressClickUntil = 0;
	const shouldSuppressClick = (): boolean => Date.now() < suppressClickUntil;

	const clickNode = (event: IElementEvent): void => {
		if (shouldSuppressClick() || event.ctrlKey || event.metaKey) return;
		const nodeId = readVisibleNodeId(event);
		if (!nodeId) return;
		if (event.shiftKey) {
			preventDefault(event);
			renderer.togglePinnedHover(nodeId);
			return;
		}
		callbacks.onSelect(nodeId);
	};
	const doubleClickNode = (event: IElementEvent): void => {
		const nodeId = readVisibleNodeId(event);
		if (!nodeId) return;
		callbacks.onSelect(nodeId);
		callbacks.onOpen(nodeId);
	};
	const clickEdge = (event: IElementEvent): void => {
		if (shouldSuppressClick()) return;
		const edgeId = renderer.getLogicalEdgeId(event.target.id);
		if (!edgeId) return;
		renderer.clearPinnedHover();
		callbacks.onSelectEdge?.(edgeId);
	};
	const clickCanvas = (event: IPointerEvent): void => {
		if (shouldSuppressClick()) return;
		renderer.clearPinnedHover();
		const groupId = renderer.getGroupAtViewportPosition(
			readViewportPosition(event),
		);
		if (groupId) {
			callbacks.onSelectGroup?.(groupId);
			return;
		}
		callbacks.onSelect(undefined);
	};

	const contextNode = (event: IElementEvent): void => {
		preventDefault(event);
		const nodeId = readVisibleNodeId(event);
		const mouseEvent = readMouseEvent(event);
		if (!nodeId || !mouseEvent) return;
		callbacks.onSelect(nodeId);
		callbacks.onContextMenu?.({ kind: 'node', nodeId }, mouseEvent);
	};
	const contextEdge = (event: IElementEvent): void => {
		preventDefault(event);
		const edgeId = renderer.getLogicalEdgeId(event.target.id);
		const mouseEvent = readMouseEvent(event);
		if (!edgeId || !mouseEvent) return;
		callbacks.onSelectEdge?.(edgeId);
		callbacks.onContextMenu?.({ kind: 'edge', edgeId }, mouseEvent);
	};
	const contextCanvas = (event: IPointerEvent): void => {
		preventDefault(event);
		const mouseEvent = readMouseEvent(event);
		if (!mouseEvent) return;
		const groupId = renderer.getGroupAtViewportPosition(
			readViewportPosition(event),
		);
		if (groupId) {
			callbacks.onSelectGroup?.(groupId);
			callbacks.onContextMenu?.({ kind: 'group', groupId }, mouseEvent);
			return;
		}
		callbacks.onSelect(undefined);
		callbacks.onContextMenu?.({ kind: 'stage' }, mouseEvent);
	};

	const enterEdge = (event: IElementEvent): void => {
		if (viewportDragging) return;
		const edgeId = renderer.getLogicalEdgeId(event.target.id);
		if (!edgeId) return;
		hoveredEdgeId = edgeId;
		renderer.setHoveredEdge(edgeId);
	};
	const leaveEdge = (event: IElementEvent): void => {
		if (viewportDragging) return;
		const edgeId = renderer.getLogicalEdgeId(event.target.id);
		if (!edgeId || hoveredEdgeId !== edgeId) return;
		hoveredEdgeId = undefined;
		renderer.setHoveredEdge(undefined);
	};

	const pointerDownNode = (event: IElementEvent): void => {
		if (
			event.button === 0 &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey &&
			callbacks.enableNodeDragging
		) {
			const id = readVisibleNodeId(event);
			if (!id) return;
			const point = readGraphPosition(renderer, event);
			const position = renderer.getNodePosition(id);
			if (!position) return;
			nodeDrag = {
				start: readViewportPosition(event),
				id,
				offsetX: position.x - point.x,
				offsetY: position.y - point.y,
				moved: false,
			};
			preventDefault(event);
			return;
		}
		if (
			event.button !== 0 ||
			(!event.ctrlKey && !event.metaKey) ||
			connectionDrag
		) {
			return;
		}
		const nodeId = readVisibleNodeId(event);
		if (!nodeId) return;
		preventDefault(event);
		const position = renderer.getNodePosition(nodeId);
		if (!position) return;
		const source = renderer.graphToViewportPosition(position);
		connectionDrag = {
			sourceNodeId: nodeId,
			x1: source.x,
			y1: source.y,
			x2: source.x,
			y2: source.y,
		};
		suppressClickUntil = Number.POSITIVE_INFINITY;
		callbacks.onSelect(nodeId);
		callbacks.onConnectionDrag?.(connectionDrag);
	};
	const pointerMove = (event: IPointerEvent): void => {
		if (nodeDrag) {
			preventDefault(event);
			const viewport = readViewportPosition(event);
			if (
				!nodeDrag.moved &&
				Math.hypot(
					viewport.x - nodeDrag.start.x,
					viewport.y - nodeDrag.start.y,
				) < 3
			)
				return;
			const point = readGraphPosition(renderer, event);
			nodeDrag.moved = true;
			suppressClickUntil = Number.POSITIVE_INFINITY;
			callbacks.onNodeDrag?.(
				nodeDrag.id,
				{
					x: point.x + nodeDrag.offsetX,
					y: point.y + nodeDrag.offsetY,
				},
				viewport,
			);
			return;
		}
		if (!connectionDrag) {
			if (viewportDragging) return;
			const position = readViewportPosition(event);
			const nodeId = renderer.getNodeAtViewportPosition(position);
			callbacks.onHover(nodeId);
			const hasElementTarget = Boolean(
				nodeId || event.targetType === 'edge',
			);
			renderer.setHoveredGroup(
				hasElementTarget
					? undefined
					: renderer.getGroupAtViewportPosition(position),
			);
			return;
		}
		preventDefault(event);
		const targetNodeId = readVisibleNodeId(event);
		const position = readViewportPosition(event);
		connectionDrag = {
			...connectionDrag,
			targetNodeId:
				targetNodeId && targetNodeId !== connectionDrag.sourceNodeId
					? targetNodeId
					: undefined,
			x2: position.x,
			y2: position.y,
		};
		callbacks.onConnectionDrag?.(connectionDrag);
	};
	const dragStart = (event: IPointerEvent): void => {
		if (nodeDrag || connectionDrag) return;
		if (event.targetType !== 'canvas') return;
		viewportDragging = true;
		renderer.beginViewportPan();
	};
	const dragCanvas = (event: IDragEvent): void => {
		if (!viewportDragging) return;
		renderer.panViewportBy({ x: event.dx, y: event.dy });
	};
	const dragEnd = (event: IPointerEvent): void => {
		if (!viewportDragging) return;
		viewportDragging = false;
		renderer.endViewportPan();
		callbacks.onHover(undefined);
		hoveredEdgeId = undefined;
		renderer.setHoveredEdge(undefined);
		renderer.setHoveredGroup(
			event.targetType === 'node' || event.targetType === 'edge'
				? undefined
				: renderer.getGroupAtViewportPosition(
						readViewportPosition(event),
					),
		);
	};
	const pointerUp = (event: IPointerEvent): void => {
		finishNodeDrag();
		finishConnectionDrag(readVisibleNodeId(event));
	};
	const pointerUpWindow = (): void => {
		finishNodeDrag();
		if (viewportDragging) renderer.endViewportPan();
		viewportDragging = false;
		finishConnectionDrag(undefined);
	};

	function finishNodeDrag(): void {
		const drag = nodeDrag;
		nodeDrag = undefined;
		if (!drag?.moved) return;
		suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS;
		callbacks.onNodeDragEnd?.(drag.id);
	}
	const cancelDrag = (): void => {
		finishNodeDrag();
		connectionDrag = undefined;
		if (viewportDragging) renderer.endViewportPan();
		viewportDragging = false;
		suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS;
		callbacks.onConnectionDrag?.(undefined);
	};

	function finishConnectionDrag(targetNodeId?: string): void {
		if (!connectionDrag) return;
		const sourceNodeId = connectionDrag.sourceNodeId;
		const target = targetNodeId ?? connectionDrag.targetNodeId;
		connectionDrag = undefined;
		suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS;
		callbacks.onConnectionDrag?.(undefined);
		if (target && target !== sourceNodeId) {
			callbacks.onConnect?.(sourceNodeId, target);
		}
	}

	function readVisibleNodeId(event: IPointerEvent): string | undefined {
		if (event.targetType !== 'node') return undefined;
		const nodeId = (event as IElementEvent).target.id;
		if (!renderer.runtimeGraph.hasNode(nodeId)) return undefined;
		const attributes = renderer.runtimeGraph.getNodeAttributes(nodeId);
		return attributes.hidden || attributes.isBend ? undefined : nodeId;
	}

	graph.on(NodeEvent.CLICK, clickNode);
	graph.on(NodeEvent.DBLCLICK, doubleClickNode);
	graph.on(NodeEvent.CONTEXT_MENU, contextNode);
	graph.on(NodeEvent.POINTER_DOWN, pointerDownNode);
	graph.on(EdgeEvent.CLICK, clickEdge);
	graph.on(EdgeEvent.CONTEXT_MENU, contextEdge);
	graph.on(EdgeEvent.POINTER_ENTER, enterEdge);
	graph.on(EdgeEvent.POINTER_LEAVE, leaveEdge);
	graph.on(CanvasEvent.CLICK, clickCanvas);
	graph.on(CanvasEvent.CONTEXT_MENU, contextCanvas);
	graph.on(CommonEvent.POINTER_MOVE, pointerMove);
	graph.on(CommonEvent.POINTER_UP, pointerUp);
	graph.on(CommonEvent.DRAG_START, dragStart);
	graph.on(CommonEvent.DRAG, dragCanvas);
	graph.on(CommonEvent.DRAG_END, dragEnd);
	const ownerWindow = renderer.container.ownerDocument?.defaultView;
	ownerWindow?.addEventListener('pointerup', pointerUpWindow);
	ownerWindow?.addEventListener('pointercancel', cancelDrag);
	ownerWindow?.addEventListener('blur', cancelDrag);

	return () => {
		nodeDrag = undefined;
		connectionDrag = undefined;
		if (viewportDragging) renderer.endViewportPan();
		viewportDragging = false;
		callbacks.onConnectionDrag?.(undefined);
		renderer.setHoveredEdge(undefined);
		renderer.setHoveredGroup(undefined);
		graph.off(NodeEvent.CLICK, clickNode);
		graph.off(NodeEvent.DBLCLICK, doubleClickNode);
		graph.off(NodeEvent.CONTEXT_MENU, contextNode);
		graph.off(NodeEvent.POINTER_DOWN, pointerDownNode);
		graph.off(EdgeEvent.CLICK, clickEdge);
		graph.off(EdgeEvent.CONTEXT_MENU, contextEdge);
		graph.off(EdgeEvent.POINTER_ENTER, enterEdge);
		graph.off(EdgeEvent.POINTER_LEAVE, leaveEdge);
		graph.off(CanvasEvent.CLICK, clickCanvas);
		graph.off(CanvasEvent.CONTEXT_MENU, contextCanvas);
		graph.off(CommonEvent.POINTER_MOVE, pointerMove);
		graph.off(CommonEvent.POINTER_UP, pointerUp);
		graph.off(CommonEvent.DRAG_START, dragStart);
		graph.off(CommonEvent.DRAG, dragCanvas);
		graph.off(CommonEvent.DRAG_END, dragEnd);
		ownerWindow?.removeEventListener('pointerup', pointerUpWindow);
		ownerWindow?.removeEventListener('pointercancel', cancelDrag);
		ownerWindow?.removeEventListener('blur', cancelDrag);
	};
}

function preventDefault(event: IPointerEvent): void {
	callEventMethod(event, 'preventDefault');
	callEventMethod(event, 'stopPropagation');
	const nativeEvent = event.nativeEvent;
	if (nativeEvent) {
		callEventMethod(nativeEvent, 'preventDefault');
		callEventMethod(nativeEvent, 'stopPropagation');
	}
}

function callEventMethod(
	event: unknown,
	method: 'preventDefault' | 'stopPropagation',
): void {
	if (!event || typeof event !== 'object') return;
	const callback = (event as Record<string, unknown>)[method];
	if (typeof callback === 'function') callback.call(event);
}

function readViewportPosition(event: IPointerEvent): {
	x: number;
	y: number;
} {
	return { x: event.viewport.x, y: event.viewport.y };
}

function readGraphPosition(
	renderer: G6Renderer,
	event: IPointerEvent,
): { x: number; y: number } {
	const x = event.canvas?.x;
	const y = event.canvas?.y;
	if (typeof x === 'number' && typeof y === 'number') {
		return renderer.canvasToGraphPosition({ x, y });
	}
	return renderer.viewportToGraphPosition(readViewportPosition(event));
}

function readMouseEvent(event: IPointerEvent): MouseEvent | undefined {
	const nativeEvent = event.nativeEvent;
	return nativeEvent &&
		typeof nativeEvent === 'object' &&
		'clientX' in nativeEvent &&
		'clientY' in nativeEvent
		? nativeEvent
		: undefined;
}
