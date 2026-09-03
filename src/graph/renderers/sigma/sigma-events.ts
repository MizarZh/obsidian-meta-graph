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
	let draggedNodeViewportOffset: { x: number; y: number } | undefined;
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
		if (
			'ctrlKey' in event.original &&
			(event.original.ctrlKey || event.original.metaKey)
		) {
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
	};
	const doubleClickNode = ({ node }: { node: string }) => {
		if (!sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			callbacks.onSelect(node);
			callbacks.onOpen(node);
		}
	};
	const clickEdge = ({
		edge,
		event,
	}: {
		edge: string;
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		if (shouldSuppressClick(event)) return;
		const logicalEdgeId = renderer.getLogicalEdgeId(edge);
		if (!logicalEdgeId) return;
		renderer.clearPinnedHover();
		callbacks.onSelectEdge?.(logicalEdgeId);
	};
	const clickStage = ({
		event,
	}: {
		event: {
			x: number;
			y: number;
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		if (shouldSuppressClick(event)) {
			return;
		}
		renderer.clearPinnedHover();
		const position = { x: event.x, y: event.y };
		const canvasEdgeId = renderer.getEdgeAtViewportPosition(position);
		if (canvasEdgeId) {
			callbacks.onSelectEdge?.(canvasEdgeId);
			return;
		}
		const groupId = renderer.getGroupAtViewportPosition(position);
		if (groupId) {
			callbacks.onSelectGroup?.(groupId);
			return;
		}
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
			if (isMouseContextEvent(event.original)) {
				callbacks.onContextMenu?.(
					{ kind: 'node', nodeId: node },
					event.original,
				);
			}
		}
	};
	const rightClickEdge = ({
		edge,
		event,
	}: {
		edge: string;
		event: {
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		event.original.preventDefault();
		event.preventSigmaDefault();
		const logicalEdgeId = renderer.getLogicalEdgeId(edge);
		if (!logicalEdgeId || !isMouseContextEvent(event.original)) return;
		callbacks.onSelectEdge?.(logicalEdgeId);
		callbacks.onContextMenu?.(
			{ kind: 'edge', edgeId: logicalEdgeId },
			event.original,
		);
	};
	const rightClickStage = ({
		event,
	}: {
		event: {
			x: number;
			y: number;
			original: MouseEvent | TouchEvent;
			preventSigmaDefault(): void;
		};
	}) => {
		event.original.preventDefault();
		event.preventSigmaDefault();
		if (!isMouseContextEvent(event.original)) return;
		const position = { x: event.x, y: event.y };
		const canvasEdgeId = renderer.getEdgeAtViewportPosition(position);
		if (canvasEdgeId) {
			callbacks.onSelectEdge?.(canvasEdgeId);
			callbacks.onContextMenu?.(
				{ kind: 'edge', edgeId: canvasEdgeId },
				event.original,
			);
			return;
		}
		const groupId = renderer.getGroupAtViewportPosition(position);
		if (groupId) {
			callbacks.onSelectGroup?.(groupId);
			callbacks.onContextMenu?.(
				{ kind: 'group', groupId },
				event.original,
			);
			return;
		}
		callbacks.onSelect(undefined);
		callbacks.onContextMenu?.({ kind: 'stage' }, event.original);
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
	const enterEdge = ({ edge }: { edge: string }) => {
		const logicalEdgeId = renderer.getLogicalEdgeId(edge);
		if (logicalEdgeId) renderer.setHoveredEdge(logicalEdgeId);
	};
	const leaveEdge = ({ edge }: { edge: string }) => {
		const logicalEdgeId = renderer.getLogicalEdgeId(edge);
		if (logicalEdgeId) renderer.clearHoveredEdge(logicalEdgeId);
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
			!event.original.metaKey &&
			(callbacks.enableForceLayout || callbacks.enableNodeDragging)
		) {
			event.original.preventDefault();
			event.preventSigmaDefault();
			previousCameraPanning = sigma.getSetting('enableCameraPanning');
			sigma.setSetting('enableCameraPanning', false);
			draggedNodeId = node;
			draggedNodeStart = readMouseViewportPosition(event.original);
			const nodeViewportPosition = readNodeViewportPosition(node);
			draggedNodeViewportOffset = {
				x: nodeViewportPosition.x - draggedNodeStart.x,
				y: nodeViewportPosition.y - draggedNodeStart.y,
			};
			hasDraggedNode = false;
			callbacks.onSelect(node);
			return;
		}
		if (!event.original.ctrlKey && !event.original.metaKey) {
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
			const viewportPosition = {
				x: event.x + (draggedNodeViewportOffset?.x ?? 0),
				y: event.y + (draggedNodeViewportOffset?.y ?? 0),
			};
			const position = sigma.viewportToGraph(viewportPosition);
			callbacks.onNodeDrag?.(draggedNodeId, position, viewportPosition);
			return;
		}
		if (!connectionDrag) {
			const position = { x: event.x, y: event.y };
			const hasHigherPriorityTarget = Boolean(
				renderer.getNodeAtViewportPosition(position) ??
				renderer.getEdgeAtViewportPosition(position),
			);
			renderer.setHoveredGroup(
				hasHigherPriorityTarget
					? undefined
					: renderer.getGroupAtViewportPosition(position),
			);
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
		draggedNodeViewportOffset = undefined;
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

	function isMouseContextEvent(
		event: MouseEvent | TouchEvent,
	): event is MouseEvent {
		return 'clientX' in event && 'clientY' in event;
	}

	sigma.on('downNode', downNode);
	sigma.on('clickNode', clickNode);
	sigma.on('clickEdge', clickEdge);
	sigma.on('doubleClickNode', doubleClickNode);
	sigma.on('clickStage', clickStage);
	sigma.on('rightClickNode', rightClickNode);
	sigma.on('rightClickEdge', rightClickEdge);
	sigma.on('rightClickStage', rightClickStage);
	sigma.on('enterNode', enterNode);
	sigma.on('leaveNode', leaveNode);
	sigma.on('enterEdge', enterEdge);
	sigma.on('leaveEdge', leaveEdge);
	sigma.on('upNode', upNode);
	sigma.on('upStage', upStage);
	mouseCaptor.on('mousemovebody', moveBody);
	mouseCaptor.on('mouseup', mouseUp);

	return () => {
		endNodeDrag();
		endConnectionDrag();
		sigma.off('downNode', downNode);
		sigma.off('clickNode', clickNode);
		sigma.off('clickEdge', clickEdge);
		sigma.off('doubleClickNode', doubleClickNode);
		sigma.off('clickStage', clickStage);
		sigma.off('rightClickNode', rightClickNode);
		sigma.off('rightClickEdge', rightClickEdge);
		sigma.off('rightClickStage', rightClickStage);
		sigma.off('enterNode', enterNode);
		sigma.off('leaveNode', leaveNode);
		sigma.off('enterEdge', enterEdge);
		sigma.off('leaveEdge', leaveEdge);
		sigma.off('upNode', upNode);
		sigma.off('upStage', upStage);
		mouseCaptor.off('mousemovebody', moveBody);
		mouseCaptor.off('mouseup', mouseUp);
	};
}
