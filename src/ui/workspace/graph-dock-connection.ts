import type { ConnectionDragState } from '../../graph/graph-events';
import { readDockDropTarget, readElementAtPoint } from '../dock/dom';
import {
	resolveGraphConnectionDropAction,
	type GraphConnectionDropAction,
	type GraphConnectionDropTarget,
} from '../interactions/graph-connection-drop';

const EMPTY_TARGET: GraphConnectionDropTarget = {
	notePath: undefined,
	templateId: undefined,
	curated: false,
};

export interface GraphDockConnectionControllerOptions {
	readConnectionDrag(): ConnectionDragState | undefined;
	readDockConnectionDrag(): unknown;
	readDocument(): Document;
	setTarget(target: GraphConnectionDropTarget): void;
	onDrop(action: GraphConnectionDropAction): void;
}

export class GraphDockConnectionController {
	private hoveredTarget: GraphConnectionDropTarget = EMPTY_TARGET;

	constructor(
		private readonly options: GraphDockConnectionControllerOptions,
	) {}

	readonly handleMouseMove = (event: MouseEvent): void => {
		if (
			!this.options.readConnectionDrag() ||
			this.options.readDockConnectionDrag()
		) {
			return;
		}
		this.setHoveredTarget(this.readDropTarget(event));
	};

	readonly handleMouseUp = (event: MouseEvent): void => {
		const connectionDrag = this.options.readConnectionDrag();
		if (!connectionDrag || this.options.readDockConnectionDrag()) {
			return;
		}
		const action = resolveGraphConnectionDropAction(
			connectionDrag.sourceNodeId,
			this.hoveredTarget,
			this.readDropTarget(event),
		);
		if (action.kind === 'none') {
			return;
		}
		this.resetTarget();
		this.options.onDrop(action);
	};

	readonly handlePointerMove = (event: PointerEvent): void => {
		this.handleMouseMove(event);
	};

	readonly handlePointerUp = (event: PointerEvent): void => {
		this.handleMouseUp(event);
	};

	resetTarget(): void {
		this.setHoveredTarget(EMPTY_TARGET);
	}

	private readDropTarget(event: MouseEvent): GraphConnectionDropTarget {
		return readDockDropTarget(
			readElementAtPoint(
				this.options.readDocument(),
				event.clientX,
				event.clientY,
			),
		);
	}

	private setHoveredTarget(target: GraphConnectionDropTarget): void {
		this.hoveredTarget = target;
		this.options.setTarget(target);
	}
}
