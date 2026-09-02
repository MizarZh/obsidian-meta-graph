import Sigma from 'sigma';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import type {
	ArcGroupGeometry,
	FlowGroupGeometry,
	GraphGroupGeometry,
	GroupMemberHaloGeometry,
	LayoutGroupGeometry,
	RadialGroupGeometry,
} from '../../../layouts/group-geometry';
import { scaleLayoutGroupPadding } from '../../../layouts/group-geometry';

const LAYER_ID = 'layout-groups';
const GROUP_MEMBER_HALO_GAP = 3;
const RADIAL_GROUP_LABEL_INSET = 15;

interface Point {
	x: number;
	y: number;
}

interface GroupMemberViewportNode {
	position: Point;
	radius: number;
}

export class LayoutGroupLayer {
	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private geometries: LayoutGroupGeometry[] = [];
	private getGroupNodeIds:
		| ((groupId: string) => Iterable<string>)
		| undefined;
	private focusedNodeId: string | undefined;
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

	setGeometries(
		geometries: readonly LayoutGroupGeometry[],
		getGroupNodeIds?: (groupId: string) => Iterable<string>,
	): void {
		this.geometries = geometries.map((geometry) => ({ ...geometry }));
		this.getGroupNodeIds = getGroupNodeIds;
		this.update();
	}

	setFocusedNode(nodeId?: string): void {
		if (this.focusedNodeId === nodeId) {
			return;
		}
		this.focusedNodeId = nodeId;
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
			this.context.save();
			if (this.isMutedByFocus(geometry)) {
				this.context.globalAlpha = 0.38;
				this.context.filter = 'grayscale(1) saturate(0)';
			}
			try {
				if (geometry.kind === 'arc-band') {
					this.drawArcBand(geometry);
				} else if (geometry.kind === 'radial-sector') {
					this.drawRadialSector(geometry);
				} else if (geometry.kind === 'flow-container') {
					this.drawFlowContainer(geometry);
				} else if (geometry.kind === 'graph-container') {
					this.drawGraphContainer(geometry);
				} else {
					this.drawGroupMemberHalos(geometry);
				}
			} finally {
				this.context.restore();
			}
		}
	}

	private isMutedByFocus(geometry: LayoutGroupGeometry): boolean {
		if (!this.focusedNodeId || !this.getGroupNodeIds) {
			return false;
		}
		for (const nodeId of this.getGroupNodeIds(geometry.groupId)) {
			if (nodeId === this.focusedNodeId) {
				return false;
			}
		}
		return true;
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
		const labelRadius = Math.max(
			innerRadius,
			outerRadius - RADIAL_GROUP_LABEL_INSET,
		);
		const labelBase = this.sigma.graphToViewport(
			radialPoint(middleAngle, labelRadius),
		);
		const tangentStart = this.sigma.graphToViewport(
			radialPoint(middleAngle - 0.01, labelRadius),
		);
		const tangentEnd = this.sigma.graphToViewport(
			radialPoint(middleAngle + 0.01, labelRadius),
		);
		this.drawLabel(
			geometry.name,
			labelBase,
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

	private drawGraphContainer(geometry: GraphGroupGeometry): void {
		const nodes = this.readGroupMemberNodes(geometry.nodeIds);
		if (nodes.length === 0) {
			return;
		}
		const scaledPadding = scaleLayoutGroupPadding(geometry.padding) * 40;
		const horizontalPadding = 12 + scaledPadding;
		const topPadding = 24 + scaledPadding;
		const bottomPadding = 12 + scaledPadding;
		let left = Math.min(
			...nodes.map((node) => node.position.x - node.radius),
		);
		let right = Math.max(
			...nodes.map((node) => node.position.x + node.radius),
		);
		const top =
			Math.min(...nodes.map((node) => node.position.y - node.radius)) -
			topPadding;
		const bottom =
			Math.max(...nodes.map((node) => node.position.y + node.radius)) +
			bottomPadding;
		left -= horizontalPadding;
		right += horizontalPadding;
		const minimumWidth = this.measureLabelWidth(geometry.name) + 20;
		if (right - left < minimumWidth) {
			const extra = (minimumWidth - (right - left)) / 2;
			left -= extra;
			right += extra;
		}

		this.context.save();
		this.context.beginPath();
		this.context.roundRect(left, top, right - left, bottom - top, 6);
		this.context.globalAlpha = 0.07;
		this.context.fillStyle = geometry.color;
		this.context.fill();
		this.context.globalAlpha = 0.58;
		this.context.strokeStyle = geometry.color;
		this.context.lineWidth = 1.5;
		this.context.stroke();
		this.context.restore();
		this.drawMemberHalos(nodes, geometry.color);

		this.drawLabel(
			geometry.name,
			{ x: (left + right) / 2, y: top + 11 },
			0,
			geometry.color,
		);
	}

	private drawGroupMemberHalos(geometry: GroupMemberHaloGeometry): void {
		this.drawMemberHalos(
			this.readGroupMemberNodes(geometry.nodeIds),
			geometry.color,
		);
	}

	private readGroupMemberNodes(
		nodeIds: readonly string[],
	): GroupMemberViewportNode[] {
		const graph = this.sigma.getGraph();
		const sizeScaler = this.sigma as unknown as {
			scaleSize(size?: number): number;
		};
		return nodeIds.flatMap((nodeId) => {
			if (!graph.hasNode(nodeId)) {
				return [];
			}
			const attributes = graph.getNodeAttributes(nodeId);
			if (attributes.hidden || attributes.isBend) {
				return [];
			}
			const scaledRadius = sizeScaler.scaleSize(attributes.size);
			return [
				{
					position: this.sigma.graphToViewport(attributes),
					radius: Number.isFinite(scaledRadius)
						? Math.max(scaledRadius, 0)
						: Math.max(attributes.size, 0),
				},
			];
		});
	}

	private drawMemberHalos(
		nodes: readonly GroupMemberViewportNode[],
		color: string,
	): void {
		this.context.save();
		this.context.globalAlpha = 0.72;
		this.context.strokeStyle = color;
		this.context.lineWidth = 2;
		for (const node of nodes) {
			this.context.beginPath();
			this.context.arc(
				node.position.x,
				node.position.y,
				node.radius + GROUP_MEMBER_HALO_GAP,
				0,
				Math.PI * 2,
			);
			this.context.stroke();
		}
		this.context.restore();
	}

	private measureLabelWidth(text: string): number {
		const style = getComputedStyle(this.sigma.getContainer());
		const fontFamily = style.fontFamily || 'sans-serif';
		this.context.save();
		this.context.font = `600 11px ${fontFamily}`;
		const width = this.context.measureText(text).width;
		this.context.restore();
		return width;
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
