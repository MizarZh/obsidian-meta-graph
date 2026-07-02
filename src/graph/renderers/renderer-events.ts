export interface GraphEventCallbacks {
	enableForceLayout?: boolean;
	enableNodeDragging?: boolean;
	onSelect(nodeId?: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
	onNodeDrag?(
		nodeId: string,
		position: { x: number; y: number },
		viewportPosition?: { x: number; y: number },
	): void;
	onNodeDragEnd?(nodeId: string): void;
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
