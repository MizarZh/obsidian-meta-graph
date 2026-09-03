export interface GraphEventCallbacks {
	enableForceLayout?: boolean;
	enableNodeDragging?: boolean;
	onSelect(nodeId?: string): void;
	onSelectEdge?(edgeId: string): void;
	onSelectGroup?(groupId: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
	onContextMenu?(target: GraphContextMenuTarget, event: MouseEvent): void;
	onNodeDrag?(
		nodeId: string,
		position: { x: number; y: number },
		viewportPosition?: { x: number; y: number },
	): void;
	onNodeDragEnd?(nodeId: string): void;
	onConnectionDrag?(state?: ConnectionDragState): void;
	onConnect?(sourceNodeId: string, targetNodeId: string): void;
}

export type GraphContextMenuTarget =
	| { kind: 'node'; nodeId: string }
	| { kind: 'edge'; edgeId: string }
	| { kind: 'group'; groupId: string }
	| { kind: 'stage' };

export interface ConnectionDragState {
	sourceNodeId: string;
	targetNodeId?: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}
