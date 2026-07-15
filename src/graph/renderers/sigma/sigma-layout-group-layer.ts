import Sigma from 'sigma';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import type {
	ArcGroupGeometry,
	FlowGroupGeometry,
	LayoutGroupGeometry,
	RadialGroupGeometry,
} from '../../../layouts/group-geometry';

const LAYER_ID = 'layout-groups';

interface Point {
	x: number;
	y: number;
}

export class LayoutGroupLayer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private geometries: LayoutGroupGeometry[] = [];
	private readonly updateBound = () => this.update();

	constructor(
		private readonly sigma: Sigma<
			RuntimeNodeAttributes,
			RuntimeEdgeAttributes
		>,
	) {
		sigma.createCanvasContext(LAYER_ID, {
			style: { pointerEvents: 'none' },
		});
		const canvases = sigma.getCanvases();
		const canvas = canvases[LAYER_ID];
		if (!canvas) {
			throw new Error('Sigma layout group layer was not created.');
		}
		const edges = canvases.edges;
		if (edges?.parentElement) {
			edges.parentElement.insertBefore(canvas, edges);
		}
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Sigma layout group canvas is unavailable.');
		}
		this.canvas = canvas;
		this.context = context;
		this.syncCanvasSize();
		sigma.on('afterRender', this.updateBound);
	}

	setGeometries(geometries: readonly LayoutGroupGeometry[]): void {
		this.geometries = geometries.map((geometry) => ({ ...geometry }));
		this.update();
	}

	update(): void {
		const { width, height } = this.sigma.getDimensions();
		this.context.clearRect(0, 0, width, height);
		this.canvas.hidden = this.geometries.length === 0;
		if (this.canvas.hidden) {
			return;
		}
		for (const geometry of this.geometries) {
			if (geometry.kind === 'arc-band') {
				this.drawArcBand(geometry);
			} else if (geometry.kind === 'radial-sector') {
				this.drawRadialSector(geometry);
			} else {
				this.drawFlowContainer(geometry);
			}
		}
	}

	kill(): void {
		this.sigma.off('afterRender', this.updateBound);
		this.sigma.killLayer(LAYER_ID);
	}

	private drawArcBand(geometry: ArcGroupGeometry): void {
		const startGraph = arcAxisPoint(geometry.direction, geometry.start);
		const endGraph = arcAxisPoint(geometry.direction, geometry.end);
		const centerGraph = arcAxisPoint(
			geometry.direction,
			(geometry.start + geometry.end) / 2,
		);
		const center = this.sigma.graphToViewport(centerGraph);
		const cross = scale(
			arcOppositeVector(geometry.direction),
			geometry.halfWidth,
		);
		const opposite = this.sigma.graphToViewport(add(centerGraph, cross));
		const normal = normalize({
			x: opposite.x - center.x,
			y: opposite.y - center.y,
		});
		const corners = [
			this.sigma.graphToViewport(add(startGraph, cross)),
			this.sigma.graphToViewport(add(endGraph, cross)),
			this.sigma.graphToViewport(add(endGraph, scale(cross, -1))),
			this.sigma.graphToViewport(add(startGraph, scale(cross, -1))),
		];
		const first = corners[0];
		const second = corners[1];
		if (!first || !second) {
			return;
		}

		this.context.save();
		this.context.globalAlpha = 0.09;
		this.context.fillStyle = geometry.color;
		this.context.beginPath();
		this.context.moveTo(first.x, first.y);
		for (const corner of corners.slice(1)) {
			this.context.lineTo(corner.x, corner.y);
		}
		this.context.closePath();
		this.context.fill();
		this.context.globalAlpha = 0.62;
		this.context.strokeStyle = geometry.color;
		this.context.lineWidth = 1.5;
		this.context.lineJoin = 'round';
		this.context.stroke();
		this.context.restore();

		this.drawLabel(
			geometry.name,
			add(opposite, scale(normal, 12)),
			Math.atan2(second.y - first.y, second.x - first.x),
			geometry.color,
		);
	}

	private drawRadialSector(geometry: RadialGroupGeometry): void {
		const { innerRadius, outerRadius } = geometry;
		const span = Math.max(0.001, geometry.endAngle - geometry.startAngle);
		const samples = Math.max(8, Math.ceil(span / (Math.PI / 36)));
		const angles = Array.from(
			{ length: samples + 1 },
			(_, index) => geometry.startAngle + (span * index) / samples,
		);
		const outer = angles.map((angle) =>
			this.sigma.graphToViewport(radialPoint(angle, outerRadius)),
		);
		const inner = [...angles]
			.reverse()
			.map((angle) =>
				this.sigma.graphToViewport(radialPoint(angle, innerRadius)),
			);
		const first = outer[0];
		if (!first) {
			return;
		}

		this.context.save();
		this.context.globalAlpha = 0.1;
		this.context.fillStyle = geometry.color;
		this.context.beginPath();
		this.context.moveTo(first.x, first.y);
		for (const point of [...outer.slice(1), ...inner]) {
			this.context.lineTo(point.x, point.y);
		}
		this.context.closePath();
		this.context.fill();
		this.context.globalAlpha = 0.58;
		this.context.strokeStyle = geometry.color;
		this.context.lineWidth = 2;
		this.context.beginPath();
		this.context.moveTo(first.x, first.y);
		for (const point of outer.slice(1)) {
			this.context.lineTo(point.x, point.y);
		}
		this.context.stroke();
		this.context.restore();

		const middleAngle = (geometry.startAngle + geometry.endAngle) / 2;
		const labelBase = this.sigma.graphToViewport(
			radialPoint(middleAngle, outerRadius),
		);
		const center = this.sigma.graphToViewport({ x: 0, y: 0 });
		const radial = normalize({
			x: labelBase.x - center.x,
			y: labelBase.y - center.y,
		});
		const tangentStart = this.sigma.graphToViewport(
			radialPoint(middleAngle - 0.01, outerRadius),
		);
		const tangentEnd = this.sigma.graphToViewport(
			radialPoint(middleAngle + 0.01, outerRadius),
		);
		this.drawLabel(
			geometry.name,
			add(labelBase, scale(radial, 15)),
			Math.atan2(
				tangentEnd.y - tangentStart.y,
				tangentEnd.x - tangentStart.x,
			),
			geometry.color,
		);
	}

	private drawFlowContainer(geometry: FlowGroupGeometry): void {
		const corners = [
			this.sigma.graphToViewport({ x: geometry.x, y: geometry.y }),
			this.sigma.graphToViewport({
				x: geometry.x + geometry.width,
				y: geometry.y,
			}),
			this.sigma.graphToViewport({
				x: geometry.x + geometry.width,
				y: geometry.y + geometry.height,
			}),
			this.sigma.graphToViewport({
				x: geometry.x,
				y: geometry.y + geometry.height,
			}),
		];
		const first = corners[0];
		const second = corners[1];
		if (!first || !second) {
			return;
		}

		this.context.save();
		this.context.globalAlpha = 0.07;
		this.context.fillStyle = geometry.color;
		this.context.beginPath();
		this.context.moveTo(first.x, first.y);
		for (const corner of corners.slice(1)) {
			this.context.lineTo(corner.x, corner.y);
		}
		this.context.closePath();
		this.context.fill();
		this.context.globalAlpha = 0.58;
		this.context.strokeStyle = geometry.color;
		this.context.lineWidth = 1.5;
		this.context.lineJoin = 'round';
		this.context.stroke();
		this.context.restore();

		const edgeCenter = {
			x: (first.x + second.x) / 2,
			y: (first.y + second.y) / 2,
		};
		const containerCenter = this.sigma.graphToViewport({
			x: geometry.x + geometry.width / 2,
			y: geometry.y + geometry.height / 2,
		});
		const inward = normalize({
			x: containerCenter.x - edgeCenter.x,
			y: containerCenter.y - edgeCenter.y,
		});
		this.drawLabel(
			geometry.name,
			add(edgeCenter, scale(inward, 13)),
			Math.atan2(second.y - first.y, second.x - first.x),
			geometry.color,
		);
	}

	private drawLabel(
		text: string,
		position: Point,
		rotation: number,
		color: string,
	): void {
		const normalizedRotation = keepTextUpright(rotation);
		const style = getComputedStyle(this.sigma.getContainer());
		const fontFamily = style.fontFamily || 'sans-serif';
		this.context.save();
		this.context.translate(position.x, position.y);
		this.context.rotate(normalizedRotation);
		this.context.font = `600 11px ${fontFamily}`;
		this.context.textAlign = 'center';
		this.context.textBaseline = 'middle';
		const width = this.context.measureText(text).width + 10;
		this.context.globalAlpha = 0.88;
		this.context.fillStyle =
			style.getPropertyValue('--background-primary').trim() || '#ffffff';
		this.context.fillRect(-width / 2, -9, width, 18);
		this.context.globalAlpha = 1;
		this.context.fillStyle = color;
		this.context.fillText(text, 0, 0);
		this.context.restore();
	}

	private syncCanvasSize(): void {
		const { width, height } = this.sigma.getDimensions();
		const referenceCanvas = this.sigma.getCanvases().edges;
		const pixelRatio =
			referenceCanvas && width > 0
				? referenceCanvas.width / width
				: (this.canvas.ownerDocument.defaultView?.devicePixelRatio ??
					1);
		this.canvas.width = Math.round(width * pixelRatio);
		this.canvas.height = Math.round(height * pixelRatio);
		this.canvas.style.width = `${width}px`;
		this.canvas.style.height = `${height}px`;
		this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	}
}

function arcAxisPoint(
	direction: ArcGroupGeometry['direction'],
	axis: number,
): Point {
	return direction === 'right' || direction === 'left'
		? { x: 0, y: axis }
		: { x: axis, y: 0 };
}

function arcOppositeVector(direction: ArcGroupGeometry['direction']): Point {
	switch (direction) {
		case 'right':
			return { x: -1, y: 0 };
		case 'left':
			return { x: 1, y: 0 };
		case 'up':
			return { x: 0, y: -1 };
		case 'down':
			return { x: 0, y: 1 };
	}
}

function radialPoint(angle: number, radius: number): Point {
	return {
		x: Math.cos(angle - Math.PI / 2) * radius,
		y: Math.sin(angle - Math.PI / 2) * radius,
	};
}

function normalize(point: Point): Point {
	const length = Math.hypot(point.x, point.y) || 1;
	return { x: point.x / length, y: point.y / length };
}

function scale(point: Point, amount: number): Point {
	return { x: point.x * amount, y: point.y * amount };
}

function add(left: Point, right: Point): Point {
	return { x: left.x + right.x, y: left.y + right.y };
}

function keepTextUpright(rotation: number): number {
	const normalized =
		((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
	return normalized > Math.PI / 2 && normalized < (Math.PI * 3) / 2
		? rotation + Math.PI
		: rotation;
}
