import type { RuntimeGraph } from "./graphology-adapter";
import type { SigmaRenderer } from "./sigma-renderer";

export interface GraphEventCallbacks {
	onSelect(nodeId?: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
	onConnectionDrag?(state?: ConnectionDragState): void;
	onConnect?(sourceNodeId: string, targetNodeId: string): void;
}

export interface ConnectionDragState {
	sourceNodeId: string;
	targetNodeId?: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export function bindGraphEvents(
	renderer: SigmaRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const sigma = renderer.instance;
	const mouseCaptor = sigma.getMouseCaptor();
	let connectionDrag: ConnectionDragState | undefined;
	let suppressNextClick = false;
	let previousCameraPanning: boolean | undefined;
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
		if (suppressNextClick) {
			suppressNextClick = false;
			return;
		}
		if (sigma.getGraph().getNodeAttribute(node, "isBend")) {
			return;
		}
		if ("shiftKey" in event.original && event.original.shiftKey) {
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
		if (suppressNextClick) {
			suppressNextClick = false;
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
		if (!sigma.getGraph().getNodeAttribute(node, "isBend")) {
			callbacks.onSelect(node);
		}
	};

	const enterNode = ({ node }: { node: string }) => {
		if (!sigma.getGraph().getNodeAttribute(node, "isBend")) {
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
			!event.original.ctrlKey ||
			sigma.getGraph().getNodeAttribute(node, "isBend")
		) {
			return;
		}
		event.original.preventDefault();
		event.preventSigmaDefault();
		previousCameraPanning = sigma.getSetting("enableCameraPanning");
		sigma.setSetting("enableCameraPanning", false);
		const source = readNodeViewportPosition(node);
		connectionDrag = {
			sourceNodeId: node,
			x1: source.x,
			y1: source.y,
			x2: source.x,
			y2: source.y,
		};
		suppressNextClick = true;
		callbacks.onSelect(node);
		callbacks.onConnectionDrag?.(connectionDrag);
	};
	const moveBody = (event: {
		x: number;
		y: number;
		preventSigmaDefault(): void;
	}) => {
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
		if (!connectionDrag) {
			return;
		}
		const { sourceNodeId } = connectionDrag;
		endConnectionDrag();
		if (
			node !== sourceNodeId &&
			!sigma.getGraph().getNodeAttribute(node, "isBend")
		) {
			callbacks.onConnect?.(sourceNodeId, node);
		}
	};
	const upStage = () => endConnectionDrag();
	const mouseUp = () => endConnectionDrag();

	function endConnectionDrag(): void {
		if (!connectionDrag) {
			return;
		}
		connectionDrag = undefined;
		if (previousCameraPanning !== undefined) {
			sigma.setSetting("enableCameraPanning", previousCameraPanning);
			previousCameraPanning = undefined;
		}
		window.setTimeout(() => {
			suppressNextClick = false;
		}, 0);
		callbacks.onConnectionDrag?.(undefined);
	}

	function readNodeViewportPosition(node: string): { x: number; y: number } {
		const attributes = sigma.getGraph().getNodeAttributes(node);
		return sigma.graphToViewport({ x: attributes.x, y: attributes.y });
	}

	sigma.on("downNode", downNode);
	sigma.on("clickNode", clickNode);
	sigma.on("clickStage", clickStage);
	sigma.on("rightClickNode", rightClickNode);
	sigma.on("enterNode", enterNode);
	sigma.on("leaveNode", leaveNode);
	sigma.on("upNode", upNode);
	sigma.on("upStage", upStage);
	mouseCaptor.on("mousemovebody", moveBody);
	mouseCaptor.on("mouseup", mouseUp);

	return () => {
		endConnectionDrag();
		sigma.off("downNode", downNode);
		sigma.off("clickNode", clickNode);
		sigma.off("clickStage", clickStage);
		sigma.off("rightClickNode", rightClickNode);
		sigma.off("enterNode", enterNode);
		sigma.off("leaveNode", leaveNode);
		sigma.off("upNode", upNode);
		sigma.off("upStage", upStage);
		mouseCaptor.off("mousemovebody", moveBody);
		mouseCaptor.off("mouseup", mouseUp);
	};
}

export function immediateNeighborhood(
	graph: RuntimeGraph,
	nodeId: string,
): Set<string> {
	const neighbors = new Set([nodeId]);
	graph.forEachEdge(
		nodeId,
		(
			_edge,
			attributes,
			source,
			target,
			_sourceAttributes,
			_targetAttributes,
		) => {
			if (
				attributes.logicalSource === nodeId &&
				attributes.logicalTarget
			) {
				neighbors.add(attributes.logicalTarget);
			} else if (
				attributes.logicalTarget === nodeId &&
				attributes.logicalSource
			) {
				neighbors.add(attributes.logicalSource);
			} else {
				neighbors.add(source === nodeId ? target : source);
			}
		},
	);
	return neighbors;
}
