import type { LabelPosition } from '@/core/types';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type {
	GroupInteractionCallbacks,
	GroupOverlayGroup,
} from '@/graph/renderers/renderer-groups';
import { CanvasTextWidthCache } from '@/graph/renderers/sigma/canvas-text-metrics';
import {
	FLOW_GROUP_TITLE_HEIGHT,
	FLOW_GROUP_TITLE_FONT_SIZE,
	getFlowGroupTitleWidth,
} from '@/layouts/flow-group-frame';

export interface FlowTitleDisplay {
	size: number;
	position: LabelPosition;
	offset: number;
	bold?: boolean;
	italic?: boolean;
}
export interface FlowTitleLayerOptions {
	container: HTMLElement;
	getGraph(): RuntimeGraph;
	toViewport(point: { x: number; y: number }): { x: number; y: number };
	nodeRadius(size: number): number;
	readLabels(): FlowTitleDisplay;
	resize(): void;
}

/** The anchor lives in graph space. Capsule text shares the node-label font
 * settings and resolved zoom size; its background scales with that text. */
export class FlowTitleLayer {
	private readonly root: HTMLDivElement;
	private readonly context: CanvasRenderingContext2D | null;
	private readonly widths = new CanvasTextWidthCache();
	private readonly elements = new Map<string, HTMLSpanElement>();
	private groups: readonly GroupOverlayGroup[] = [];
	private callbacks: GroupInteractionCallbacks = {};

	constructor(private readonly options: FlowTitleLayerOptions) {
		const { container } = options;
		const document = container.ownerDocument;
		this.root = document.createElement('div');
		this.root.className = 'knowledge-workspace-flow-titles';
		container.parentElement?.appendChild(this.root);
		this.context = document.createElement('canvas').getContext('2d');
	}

	setGroups(
		groups: readonly GroupOverlayGroup[],
		callbacks: GroupInteractionCallbacks,
	): void {
		this.groups = groups;
		this.callbacks = callbacks;
		const ids = new Set(groups.map((group) => group.id));
		for (const [id, element] of this.elements)
			if (!ids.has(id)) {
				element.remove();
				this.elements.delete(id);
			}
		this.update();
	}

	private measure(
		text: string,
		size: number,
		bold = false,
		italic = false,
	): number {
		if (!this.context) return Array.from(text).length * size;
		const family =
			this.options.container.ownerDocument.defaultView?.getComputedStyle(
				this.options.container,
			).fontFamily || 'sans-serif';
		return this.widths.measure(this.context, text, {
			family,
			size,
			weight: bold ? 600 : 400,
			style: italic ? 'italic' : 'normal',
		});
	}

	/** Camera changes only project the fixed title rectangle; they never relocate it. */
	update(): void {
		const labels = this.options.readLabels();
		const fontSize =
			Number.isFinite(labels.size) && labels.size > 0
				? labels.size
				: FLOW_GROUP_TITLE_FONT_SIZE;
		const scale = fontSize / FLOW_GROUP_TITLE_FONT_SIZE;
		for (const group of this.groups) {
			let element = this.elements.get(group.id);
			if (!element) {
				element = this.root.ownerDocument.createElement('span');
				element.className = 'knowledge-workspace-flow-title';
				element.tabIndex = 0;
				element.setAttribute('role', 'button');
				element.addEventListener('pointerdown', (event) => {
					event.stopPropagation();
					this.callbacks.onSelectGroup?.(group.id);
				});
				element.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						this.callbacks.onSelectGroup?.(group.id);
					}
				});
				element.addEventListener('contextmenu', (event) => {
					event.preventDefault();
					this.callbacks.onContextMenu?.(group.id, event);
				});
				this.elements.set(group.id, element);
			}
			element.textContent = group.name;
			element.title = group.name;
			element.style.setProperty('--flow-title-color', group.color);
			const anchor = this.options.toViewport({
				x: group.x + group.width / 2,
				// High canonical Y is the screen-top title band.
				y: group.y + group.height - (group.titleBandHeight ?? 0) / 2,
			});
			const width = getFlowGroupTitleWidth(
				group.name,
				this.measure(
					group.name,
					FLOW_GROUP_TITLE_FONT_SIZE,
					labels.bold,
					labels.italic,
				),
			);
			if (element.parentElement !== this.root)
				this.root.appendChild(element);
			Object.assign(element.style, {
				left: `${anchor.x - (width * scale) / 2}px`,
				top: `${anchor.y - (FLOW_GROUP_TITLE_HEIGHT * scale) / 2}px`,
				width: `${width}px`,
				fontSize: `${FLOW_GROUP_TITLE_FONT_SIZE}px`,
				fontWeight: labels.bold ? '600' : '400',
				fontStyle: labels.italic ? 'italic' : 'normal',
				transformOrigin: '0 0',
				transform: `scale(${scale})`,
			});
		}
	}

	destroy(): void {
		this.root.remove();
		this.elements.clear();
		this.widths.clear();
	}
}
