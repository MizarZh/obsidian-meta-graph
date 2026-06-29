import type { ConnectionDragState } from '../../graph/graph-events';
import type { GraphRenderer } from '../../graph/renderer-adapter';
import {
	createDockConnectionDragState,
	updateDockConnectionDragState,
} from '../dock/connection-drag';
import {
	resolveDockPayloadGraphAction,
	type DockPayloadGraphAction,
} from '../dock/connection';
import {
	readElementCenterViewportPosition,
	readViewportPoint,
} from '../dock/dom';
import { canDockPayloadTargetNode } from '../dock/drag';
import type { DockDragPayload } from '../dock/types';

export interface DockGraphDragControllerOptions {
	window: Window;
	readCanvas(): HTMLElement | undefined;
	readRenderer(): GraphRenderer | undefined;
	readHoveredNodeId(): string | undefined;
	setDockDrag(payload: DockDragPayload | undefined): void;
	setDockConnectionDrag(payload: DockDragPayload | undefined): void;
	setConnectionDrag(state: ConnectionDragState | undefined): void;
	setDockTarget(nodeId: string | undefined): void;
	onDrop(action: DockPayloadGraphAction): void;
}

export class DockGraphDragController {
	private connectionDrag: ConnectionDragState | undefined;
	private dockConnectionDrag: DockDragPayload | undefined;
	private dockTargetNodeId: string | undefined;

	constructor(private readonly options: DockGraphDragControllerOptions) {}

	readonly handlePointerDown = (
		payload: DockDragPayload,
		event: PointerEvent,
	): void => {
		const canvas = this.options.readCanvas();
		if (
			!canvas ||
			!this.options.readRenderer() ||
			!(event.currentTarget instanceof HTMLElement)
		) {
			return;
		}
		const source = readElementCenterViewportPosition(
			canvas,
			event.currentTarget,
		);
		const point = this.readViewportPoint(event.clientX, event.clientY);
		this.options.setDockDrag(payload);
		this.dockConnectionDrag = payload;
		this.options.setDockConnectionDrag(payload);
		this.connectionDrag = createDockConnectionDragState(
			payload,
			source,
			point,
		);
		this.options.setConnectionDrag(this.connectionDrag);
		this.options.window.addEventListener(
			'pointermove',
			this.handlePointerMove,
			{ capture: true },
		);
		this.options.window.addEventListener(
			'pointerup',
			this.handlePointerUp,
			{
				capture: true,
				once: true,
			},
		);
	};

	resetConnectionDrag(): void {
		this.options.window.removeEventListener(
			'pointermove',
			this.handlePointerMove,
			{ capture: true },
		);
		this.options.window.removeEventListener(
			'pointerup',
			this.handlePointerUp,
			{ capture: true },
		);
		this.connectionDrag = undefined;
		this.dockConnectionDrag = undefined;
		this.options.setConnectionDrag(undefined);
		this.options.setDockConnectionDrag(undefined);
		this.resetDockDrag();
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.connectionDrag || !this.dockConnectionDrag) {
			return;
		}
		event.preventDefault();
		const point = this.readViewportPoint(event.clientX, event.clientY);
		const targetNodeId = this.readNodeAtClientPosition(
			event.clientX,
			event.clientY,
			this.dockConnectionDrag,
		);
		this.setDockTarget(targetNodeId);
		this.connectionDrag = updateDockConnectionDragState(
			this.connectionDrag,
			point,
			targetNodeId,
		);
		this.options.setConnectionDrag(this.connectionDrag);
	};

	private readonly handlePointerUp = (event: PointerEvent): void => {
		if (!this.dockConnectionDrag) {
			return;
		}
		const payload = this.dockConnectionDrag;
		const targetNodeId =
			this.dockTargetNodeId ??
			this.readNodeAtClientPosition(event.clientX, event.clientY, payload);
		this.resetConnectionDrag();
		if (!targetNodeId) {
			return;
		}
		this.options.onDrop(resolveDockPayloadGraphAction(payload, targetNodeId));
	};

	private resetDockDrag(): void {
		this.options.setDockDrag(undefined);
		this.setDockTarget(undefined);
	}

	private readNodeAtClientPosition(
		clientX: number,
		clientY: number,
		payload: DockDragPayload,
	): string | undefined {
		const renderer = this.options.readRenderer();
		if (!this.options.readCanvas() || !renderer) {
			return undefined;
		}
		const point = this.readViewportPoint(clientX, clientY);
		const nodeId = renderer.getNodeAtViewportPosition({
			x: point.x,
			y: point.y,
		});
		if (!nodeId) {
			return undefined;
		}
		return canDockPayloadTargetNode(payload, nodeId) ? nodeId : undefined;
	}

	private readViewportPoint(clientX: number, clientY: number): {
		x: number;
		y: number;
	} {
		const canvas = this.options.readCanvas();
		if (!canvas) {
			return { x: clientX, y: clientY };
		}
		return readViewportPoint(canvas, clientX, clientY);
	}

	private setDockTarget(nodeId?: string): void {
		if (this.dockTargetNodeId === nodeId) {
			return;
		}
		this.dockTargetNodeId = nodeId;
		this.options.setDockTarget(nodeId);
		this.options
			.readRenderer()
			?.setHovered(nodeId ?? this.options.readHoveredNodeId());
	}
}
