import type {
	GraphEventCallbacks,
	ConnectionDragState,
} from '../renderer-events';
import type { SigmaRenderer } from './sigma-renderer';

export function bindGraphEvents(
	renderer: SigmaRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const sigma = renderer.instance;
	const mouseCaptor = sigma.getMouseCaptor();
	let connectionDrag: ConnectionDragState | undefined;
	let draggedNodeId: string | undefined;
	let draggedNodeStart: { x: number; y: number } | undefined;
	let hasDraggedNode = false;
	let suppressNextClick = false;
	let suppressClickUntil = 0;
	let previousCameraPanning: boolean | undefined;
	const NODE_DRAG_THRESHOLD_PX = 3;
	const DRAG_CLICK_SUPPRESSION_MS = 500;
	const clickNode = ({
		node,
		event,
	}: {
		node: string;
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		if (shouldSuppressClick(event)) {
			return;
		}
		if ('ctrlKey' in event.original && event.original.ctrlKey) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			return;
		}
		if (sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			return;
		}
		if ('shiftKey' in event.original && event.original.shiftKey) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			renderer.togglePinnedHover(node);
			return;
		}
		callbacks.onSelect(node);
		callbacks.onOpen(node);
	};
	const clickStage = ({
		event,
	}: {
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		if (shouldSuppressClick(event)) {
			return;
		}
		renderer.clearPinnedHover();
		callbacks.onSelect(undefined);
	};

	const rightClickNode = ({
		node,
		event,
	}: {
		node: string;
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		event.original.preventDefault();
		event.preventSigmaDefault();
		if (!sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			callbacks.onSelect(node);
		}
	};

	const enterNode = ({ node }: { node: string }) => {
		if (!sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			if (connectionDrag && node !== connectionDrag.sourceNodeId) {
				connectionDrag = { ...connectionDrag, targetNodeId: node };
				callbacks.onConnectionDrag?.(connectionDrag);
			}
			callbacks.onHover(node);
		}
	};
	const leaveNode = ({ node }: { node: string }) => {
		if (connectionDrag?.targetNodeId === node) {
			connectionDrag = { ...connectionDrag, targetNodeId: undefined };
			callbacks.onConnectionDrag?.(connectionDrag);
		}
		callbacks.onHover(undefined);
	};
	const downNode = ({
		node,
		event,
	}: {
		node: string;
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		if (
			!(event.original instanceof MouseEvent) ||
			event.original.button !== 0 ||
			sigma.getGraph().getNodeAttribute(node, 'isBend')
		) {
			return;
		}
		if (
			!event.original.ctrlKey &&
			(callbacks.enableForceLayout || callbacks.enableNodeDragging)
		) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			previousCameraPanning = sigma.getSetting('enableCameraPanning');
			sigma.setSetting('enableCameraPanning', false);
			draggedNodeId = node;
			draggedNodeStart = readMouseViewportPosition(event.original);
			hasDraggedNode = false;
			callbacks.onSelect(node);
			return;
		}
		if (!event.original.ctrlKey) {
			return;
		}
		event.original.preventDefault();
		event.preventSigmaDefault();
		previousCameraPanning = sigma.getSetting('enableCameraPanning');
		sigma.setSetting('enableCameraPanning', false);
		const source = readNodeViewportPosition(node);
		connectionDrag = {
			sourceNodeId: node,
			x1: source.x,
			y1: source.y,
			x2: source.x,
			y2: source.y,
		};
		startDragClickSuppression();
		callbacks.onSelect(node);
		callbacks.onConnectionDrag?.(connectionDrag);
	};
	const moveBody = (event: {
		x: number;
		y: number;
		preventSigmaDefault(): void;
	}) => {
		if (draggedNodeId) {
			event.preventSigmaDefault();
			if (
				!hasDraggedNode &&
				draggedNodeStart &&
				Math.hypot(
					event.x - draggedNodeStart.x,
					event.y - draggedNodeStart.y,
				) < NODE_DRAG_THRESHOLD_PX
			) {
				return;
			}
			hasDraggedNode = true;
			startDragClickSuppression();
			const position = sigma.viewportToGraph({ x: event.x, y: event.y });
			callbacks.onNodeDrag?.(draggedNodeId, position);
			return;
		}
		if (!connectionDrag) {
			return;
		}
		event.preventSigmaDefault();
		connectionDrag = {
			...connectionDrag,
			x2: event.x,
			y2: event.y,
		};
		callbacks.onConnectionDrag?.(connectionDrag);
	};
	const upNode = ({ node }: { node: string }) => {
		if (draggedNodeId) {
			endNodeDrag();
			return;
		}
		if (!connectionDrag) {
			return;
		}
		const { sourceNodeId } = connectionDrag;
		endConnectionDrag();
		if (
			node !== sourceNodeId &&
			!sigma.getGraph().getNodeAttribute(node, 'isBend')
		) {
			callbacks.onConnect?.(sourceNodeId, node);
		}
	};
	const upStage = () => {
		endNodeDrag();
		endConnectionDrag();
	};
	const mouseUp = () => {
		endNodeDrag();
		endConnectionDrag();
	};

	function endNodeDrag(): void {
		if (!draggedNodeId) {
			return;
		}
		const nodeId = draggedNodeId;
		sigma.getGraph().setNodeAttribute(draggedNodeId, 'fixed', false);
		draggedNodeId = undefined;
		draggedNodeStart = undefined;
		if (previousCameraPanning !== undefined) {
			sigma.setSetting('enableCameraPanning', previousCameraPanning);
			previousCameraPanning = undefined;
		}
		if (hasDraggedNode) {
			callbacks.onNodeDragEnd?.(nodeId);
			suppressClickForDrag();
		}
		hasDraggedNode = false;
	}

	function endConnectionDrag(): void {
		if (!connectionDrag) {
			return;
		}
		connectionDrag = undefined;
		suppressClickForDrag();
		if (previousCameraPanning !== undefined) {
			sigma.setSetting('enableCameraPanning', previousCameraPanning);
			previousCameraPanning = undefined;
		}
		callbacks.onConnectionDrag?.(undefined);
	}

	function startDragClickSuppression(): void {
		suppressNextClick = true;
		suppressClickUntil = Number.POSITIVE_INFINITY;
	}

	function suppressClickForDrag(): void {
		suppressNextClick = true;
		suppressClickUntil = Date.now() + DRAG_CLICK_SUPPRESSION_MS;
		window.setTimeout(() => {
			suppressNextClick = false;
		}, DRAG_CLICK_SUPPRESSION_MS);
	}

	function shouldSuppressClick(event: {
		original: MouseEvent | TouchEvent;
		preventSigmaDefault(): void;
	}): boolean {
		if (hasDraggedNode) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			return true;
		}
		if (Date.now() < suppressClickUntil) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			return true;
		}
		if (suppressNextClick) {
			suppressNextClick = false;
			event.original.preventDefault();
			event.preventSigmaDefault();
			return true;
		}
		return false;
	}

	function readNodeViewportPosition(node: string): { x: number; y: number } {
		const attributes = sigma.getGraph().getNodeAttributes(node);
		return sigma.graphToViewport({ x: attributes.x, y: attributes.y });
	}

	function readMouseViewportPosition(event: MouseEvent): {
		x: number;
		y: number;
	} {
		const rect = sigma.getContainer().getBoundingClientRect();
		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	sigma.on('downNode', downNode);
	sigma.on('clickNode', clickNode);
	sigma.on('clickStage', clickStage);
	sigma.on('rightClickNode', rightClickNode);
	sigma.on('enterNode', enterNode);
	sigma.on('leaveNode', leaveNode);
	sigma.on('upNode', upNode);
	sigma.on('upStage', upStage);
	mouseCaptor.on('mousemovebody', moveBody);
	mouseCaptor.on('mouseup', mouseUp);

	return () => {
		endNodeDrag();
		endConnectionDrag();
		sigma.off('downNode', downNode);
		sigma.off('clickNode', clickNode);
		sigma.off('clickStage', clickStage);
		sigma.off('rightClickNode', rightClickNode);
		sigma.off('enterNode', enterNode);
		sigma.off('leaveNode', leaveNode);
		sigma.off('upNode', upNode);
		sigma.off('upStage', upStage);
		mouseCaptor.off('mousemovebody', moveBody);
		mouseCaptor.off('mouseup', mouseUp);
	};
}
