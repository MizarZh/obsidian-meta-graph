import type { ChartSource } from '../../core/types';
import type { GraphRenderer } from '../../graph/renderers/renderer-adapter';
import { readViewportPoint } from '../dock/dom';
import type { DockDragPayload } from '../dock/types';

export type DockCuratedDropAction =
	| {
			kind: 'add-note';
			notePath: string;
			position: { x: number; y: number };
			groupId?: string;
	  }
	| {
			kind: 'create-template-note';
			templateId: string;
			label: string;
			position: { x: number; y: number };
			groupId?: string;
	  };

export interface DockCuratedDropPreview {
	x: number;
	y: number;
	label: string;
	groupId?: string;
}

interface GroupDropRenderer {
	getGroupAtViewportPosition(position: {
		x: number;
		y: number;
	}): string | undefined;
	viewportToGraphPosition(position: { x: number; y: number }): {
		x: number;
		y: number;
	};
	setActiveDropGroup(groupId?: string): void;
}

export interface DockCuratedDropControllerOptions {
	window: Window;
	readCanvas(): HTMLElement | undefined;
	readRenderer(): GraphRenderer | undefined;
	readChartSource(): ChartSource;
	readElementAtPoint(clientX: number, clientY: number): Element | null;
	canStartDrag(payload: DockDragPayload): boolean;
	setDockDrag(payload: DockDragPayload | undefined): void;
	setPreview(preview: DockCuratedDropPreview | undefined): void;
	setActiveNodeDropGroupId(groupId: string | undefined): void;
	onDrop(action: DockCuratedDropAction): void;
}

const DRAG_START_DISTANCE = 4;

export class DockCuratedDropController {
	private payload: DockDragPayload | undefined;
	private activeGroupId: string | undefined;
	private startPoint: { x: number; y: number } | undefined;
	private dragging = false;

	constructor(private readonly options: DockCuratedDropControllerOptions) {}

	readonly handlePointerDown = (
		payload: DockDragPayload,
		event: PointerEvent,
	): boolean => {
		if (
			event.button !== 0 ||
			event.ctrlKey ||
			event.metaKey ||
			payload.kind === 'broken-note' ||
			this.options.readChartSource() !== 'curated' ||
			!this.options.canStartDrag(payload) ||
			!this.options.readCanvas() ||
			!this.options.readRenderer()
		) {
			return false;
		}

		this.payload = payload;
		this.startPoint = { x: event.clientX, y: event.clientY };
		this.dragging = false;
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
		return true;
	};

	reset(): void {
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
		this.payload = undefined;
		this.startPoint = undefined;
		this.dragging = false;
		this.options.setDockDrag(undefined);
		this.options.setPreview(undefined);
		this.setActiveGroup(undefined);
	}

	private readonly handlePointerMove = (event: PointerEvent): void => {
		if (!this.payload) {
			return;
		}
		if (!this.dragging) {
			if (!this.hasMovedPastThreshold(event)) {
				return;
			}
			this.dragging = true;
			this.options.setDockDrag(this.payload);
		}
		const groupId = this.readGroupAtClientPosition(event);
		const canvas = this.options.readCanvas();
		if (!canvas) {
			this.reset();
			return;
		}
		if (!this.isValidDropTarget(event.clientX, event.clientY)) {
			this.setActiveGroup(undefined);
			this.options.setPreview(undefined);
			return;
		}
		this.setActiveGroup(groupId);
		this.options.setPreview({
			...readViewportPoint(canvas, event.clientX, event.clientY),
			label: this.payload.label,
			groupId,
		});
	};

	private readonly handlePointerUp = (event: PointerEvent): void => {
		const payload = this.payload;
		if (!payload) {
			return;
		}
		const groupId = this.readGroupAtClientPosition(event);
		const position = this.readGraphPositionAtClientPosition(event);
		const canvasTargeted = this.isValidDropTarget(
			event.clientX,
			event.clientY,
		);
		const dragging = this.dragging;
		this.reset();
		if (!dragging || !canvasTargeted || !position) {
			return;
		}
		if (payload.kind === 'note') {
			this.options.onDrop({
				kind: 'add-note',
				notePath: payload.notePath,
				position,
				groupId,
			});
			return;
		}
		if (payload.kind !== 'template') {
			return;
		}
		this.options.onDrop({
			kind: 'create-template-note',
			templateId: payload.templateId,
			label: payload.label,
			position,
			groupId,
		});
	};

	private hasMovedPastThreshold(event: PointerEvent): boolean {
		if (!this.startPoint) {
			return false;
		}
		return (
			Math.hypot(
				event.clientX - this.startPoint.x,
				event.clientY - this.startPoint.y,
			) >= DRAG_START_DISTANCE
		);
	}

	private readGroupAtClientPosition(event: PointerEvent): string | undefined {
		const canvas = this.options.readCanvas();
		const renderer = readGroupDropRenderer(this.options.readRenderer());
		if (
			!canvas ||
			!renderer ||
			!this.isValidDropTarget(event.clientX, event.clientY)
		) {
			return undefined;
		}
		return renderer.getGroupAtViewportPosition(
			readViewportPoint(canvas, event.clientX, event.clientY),
		);
	}

	private readGraphPositionAtClientPosition(
		event: PointerEvent,
	): { x: number; y: number } | undefined {
		const canvas = this.options.readCanvas();
		const renderer = readGroupDropRenderer(this.options.readRenderer());
		if (
			!canvas ||
			!renderer ||
			!this.isValidDropTarget(event.clientX, event.clientY)
		) {
			return undefined;
		}
		return renderer.viewportToGraphPosition(
			readViewportPoint(canvas, event.clientX, event.clientY),
		);
	}

	private isInsideCanvas(clientX: number, clientY: number): boolean {
		const canvas = this.options.readCanvas();
		if (!canvas) {
			return false;
		}
		const rect = canvas.getBoundingClientRect();
		return (
			clientX >= rect.left &&
			clientX <= rect.right &&
			clientY >= rect.top &&
			clientY <= rect.bottom
		);
	}

	private isValidDropTarget(clientX: number, clientY: number): boolean {
		return (
			this.isInsideCanvas(clientX, clientY) &&
			!isCancelTarget(this.options.readElementAtPoint(clientX, clientY))
		);
	}

	private setActiveGroup(groupId: string | undefined): void {
		if (this.activeGroupId === groupId) {
			return;
		}
		this.activeGroupId = groupId;
		this.options.setActiveNodeDropGroupId(groupId);
		readGroupDropRenderer(this.options.readRenderer())?.setActiveDropGroup(
			groupId,
		);
	}
}

function isCancelTarget(target: Element | null): boolean {
	return Boolean(
		target?.closest(
			'.knowledge-workspace-dock-panel, .knowledge-workspace-curated-panel, .knowledge-workspace-display-controls, .knowledge-workspace-inspector, .knowledge-workspace-connection-panel, .workspace-tab-header-container, .view-header',
		),
	);
}

function readGroupDropRenderer(
	renderer: GraphRenderer | undefined,
): GroupDropRenderer | undefined {
	const candidate = renderer as Partial<GroupDropRenderer> | undefined;
	return typeof candidate?.getGroupAtViewportPosition === 'function' &&
		typeof candidate.viewportToGraphPosition === 'function' &&
		typeof candidate.setActiveDropGroup === 'function'
		? (candidate as GroupDropRenderer)
		: undefined;
}
