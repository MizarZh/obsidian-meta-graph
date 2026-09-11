import type { NodeShape, WorkspaceState } from '@/core/types';
import type { GraphPosition } from '@/graph/model/graphology-adapter';
import { truncateLabel } from '@/graph/label-text';
import {
	getNodeLabelBox,
	getRotatedNodeLabelBox,
} from '@/graph/renderers/sigma/sigma-label-geometry';
import type { ResolvedLabelStyle } from '@/graph/renderers/renderer-label-style';

const namespace = 'http://www.w3.org/2000/svg';

export class SvgDrawing {
	readonly root: SVGSVGElement;
	readonly context: CanvasRenderingContext2D;
	constructor(
		readonly document: Document,
		readonly fontFamily: string,
	) {
		this.root = document.createElementNS(namespace, 'svg');
		const context = document.createElement('canvas').getContext('2d');
		if (!context) throw new Error('Text measurement is unavailable');
		this.context = context;
		this.root.setAttribute('font-family', fontFamily);
	}

	element<K extends keyof SVGElementTagNameMap>(
		tag: K,
		attributes: Record<string, string | number>,
		parent: Element = this.root,
	): SVGElementTagNameMap[K] {
		const element = this.document.createElementNS(namespace, tag);
		for (const [key, value] of Object.entries(attributes)) {
			if (typeof value === 'number' && !Number.isFinite(value))
				throw new Error('Graph contains invalid coordinates');
			element.setAttribute(key, String(value));
		}
		parent.appendChild(element);
		return element;
	}

	color(value: string): string {
		this.context.fillStyle = '#000000';
		this.context.fillStyle = value;
		return this.context.fillStyle;
	}

	text(
		value: string,
		x: number,
		y: number,
		size: number,
		color: string,
		parent: Element = this.root,
	): SVGTextElement {
		const text = this.element(
			'text',
			{
				x,
				y,
				'font-size': size,
				fill: this.color(color),
				'dominant-baseline': 'central',
			},
			parent,
		);
		// XML 1.0 disallows these controls even when they occur in note names.
		text.textContent = value.replace(
			// eslint-disable-next-line no-control-regex
			/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,
			'',
		);
		return text;
	}

	shape(
		shape: NodeShape,
		point: GraphPosition,
		radius: number,
		color: string,
		parent: Element,
	): void {
		const fill = this.color(color);
		if (shape === 'circle') {
			this.element(
				'circle',
				{ cx: point.x, cy: point.y, r: radius, fill },
				parent,
			);
			return;
		}
		if (shape === 'square') {
			this.element(
				'rect',
				{
					x: point.x - radius,
					y: point.y - radius,
					width: radius * 2,
					height: radius * 2,
					fill,
				},
				parent,
			);
			return;
		}
		const count =
			shape === 'star'
				? 10
				: shape === 'triangle'
					? 3
					: shape === 'diamond'
						? 4
						: 6;
		const points = Array.from({ length: count }, (_, i) => {
			const r = shape === 'star' && i % 2 ? radius * 0.4 : radius;
			const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
			return `${point.x + Math.cos(angle) * r},${point.y + Math.sin(angle) * r}`;
		}).join(' ');
		this.element('polygon', { points, fill }, parent);
	}

	label(
		value: string,
		point: GraphPosition,
		radius: number,
		size: number,
		state: WorkspaceState,
		theme: ResolvedLabelStyle,
		parent: Element,
		rotation?: number,
		direction: 1 | -1 = 1,
		centered = false,
	): void {
		this.context.font = `${state.labelItalic ? 'italic' : 'normal'} ${state.labelBold ? 'bold' : 'normal'} ${size}px ${this.fontFamily}`;
		const maxWidth =
			state.labelMaxWidth > 0
				? (state.labelMaxWidth * size) / state.labelSize
				: 0;
		const text = truncateLabel(
			value,
			maxWidth,
			(s) => this.context.measureText(s).width,
		);
		if (!text) return;
		const width = this.context.measureText(text).width + 8,
			height = size + 6;
		const position = centered ? 'center' : state.labelPosition;
		const gap = size * state.labelOffset;
		const box =
			rotation === undefined
				? getNodeLabelBox(
						point.x,
						point.y,
						radius,
						width,
						height,
						4,
						position,
						gap,
					)
				: getRotatedNodeLabelBox(
						radius,
						width,
						height,
						4,
						gap,
						direction,
						position,
					);
		const group = this.element(
			'g',
			rotation === undefined
				? {}
				: {
						transform: `translate(${point.x} ${point.y}) rotate(${(rotation * 180) / Math.PI})`,
					},
			parent,
		);
		this.element(
			'rect',
			{
				x: box.x,
				y: box.y,
				width,
				height,
				rx: 4,
				fill: this.color(theme.backgroundColor),
			},
			group,
		);
		const element = this.text(
			text,
			box.textX,
			box.textY,
			size,
			theme.textColor,
			group,
		);
		element.setAttribute(
			'text-anchor',
			box.textAlign === 'center'
				? 'middle'
				: box.textAlign === 'right'
					? 'end'
					: 'start',
		);
		element.setAttribute(
			'font-weight',
			state.labelBold ? 'bold' : 'normal',
		);
		element.setAttribute(
			'font-style',
			state.labelItalic ? 'italic' : 'normal',
		);
	}
}
