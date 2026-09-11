import type { WorkspaceState } from '@/core/types';
import type {
	GraphPosition,
	RuntimeGraph,
} from '@/graph/model/graphology-adapter';
import type { PlanarRenderer } from '@/graph/renderers/renderer-contracts';
import type { LayoutSnapshot } from '@/layouts/stable-layout';
import { readGraphPalette } from '@/graph/styles/graph-styles';
import {
	snapshotPlanarPositions,
	type PngExportOptions,
} from '@/graph/renderers/renderer-export';
import {
	getPlanarLabelVisualScale,
	getPlanarVisualScale,
} from '@/graph/renderers/planar-viewport-scale';
import { resolveThreeLabelStyle } from '@/graph/renderers/renderer-label-style';
import {
	createG6LabelVisibilityIndex,
	resolveG6LabelVisibilityFromIndex,
} from '@/graph/renderers/g6/g6-data';
import { getCanonicalParallelLane } from '@/graph/model/parallel-edges';
import { resolveEdgeVisualMetrics } from '@/graph/renderers/sigma/sigma-edge-visual-metrics';
import { createParallelCanvasRoute } from '@/graph/renderers/sigma/sigma-parallel-edge-layer';
import { createParallelCurveRoute } from '@/graph/renderers/sigma/sigma-parallel-curve';
import { buildGraphLegend } from '@/ui/workspace/graph-legend';
import { truncateLabel } from '@/graph/label-text';
import { SvgDrawing } from './svg-drawing';
import { logicalExportEdges } from './logical-export-graph';

type Project = (point: GraphPosition) => GraphPosition;

export async function createSvgExport(input: {
	renderer: PlanarRenderer;
	canvas: HTMLElement;
	state: WorkspaceState;
	layout: LayoutSnapshot;
	options: PngExportOptions;
	isStale: () => boolean;
	metadataFields: string[];
	metadataTypes: Record<string, string>;
}): Promise<Blob> {
	const { renderer, canvas, options, isStale } = input;
	if (isStale()) throw new Error('Export cancelled');
	await canvas.ownerDocument.fonts.ready;
	if (isStale()) throw new Error('Export cancelled');
	const graph = renderer.runtimeGraph.copy();
	snapshotPlanarPositions(graph, (id) => renderer.getNodePosition(id));
	const state = input.state,
		layout = input.layout;
	const palette = readGraphPalette(canvas),
		theme = resolveThreeLabelStyle(palette, state);
	const { width, height } = canvas.getBoundingClientRect();
	if (!(width > 0 && height > 0)) throw new Error('Graph is not ready');
	const draw = new SvgDrawing(
		canvas.ownerDocument,
		canvas.ownerDocument.defaultView!.getComputedStyle(canvas).fontFamily ||
			'sans-serif',
	);
	const svg = draw.root;
	const content = draw.element('g', { 'data-layer': 'graph' });
	const groups = draw.element('g', { 'data-layer': 'groups' }, content);
	const edges = draw.element('g', { 'data-layer': 'relationships' }, content);
	const nodes = draw.element('g', { 'data-layer': 'nodes' }, content);
	const labels = draw.element('g', { 'data-layer': 'labels' }, content);
	const project: Project = (point) => {
		const result = renderer.graphToViewportPosition(point);
		if (!Number.isFinite(result.x) || !Number.isFinite(result.y))
			throw new Error('Graph contains invalid coordinates');
		return result;
	};
	const visualScale = getPlanarVisualScale(renderer.getZoomLevel());
	const labelSize =
		state.labelSize *
		(state.scaleLabelsWithZoom
			? getPlanarLabelVisualScale(renderer.getZoomLevel())
			: 1);
	const visibility = resolveG6LabelVisibilityFromIndex(
		createG6LabelVisibilityIndex(graph),
		state,
	);
	const radius = (id: string) =>
		graph.getNodeAttribute(id, 'size') * visualScale;
	let strokePadding = 1;
	drawGroups(
		draw,
		groups,
		graph,
		layout,
		state,
		project,
		visualScale,
		labelSize,
		palette.background ?? '#ffffff',
	);
	for (const edge of logicalExportEdges(
		graph,
		layout.edgeRoutes,
		state.projection?.edges,
	)) {
		const a = edge.attributes;
		const metrics = resolveEdgeVisualMetrics({
			edgeSize: a.size,
			arrowSize: a.arrowSize,
			arrowStyle: a.arrowStyle,
			lineStyle: a.lineStyle,
			scaleSize: (value) => value * visualScale,
			minEdgeThickness: 0.1,
		});
		strokePadding = Math.max(strokePadding, metrics.nominalLineWidth / 2);
		const group = draw.element(
			'g',
			{ 'data-edge-id': edge.id, opacity: a.opacity ?? 1 },
			edges,
		);
		const path = draw.element(
			'path',
			{
				fill: 'none',
				stroke: draw.color(a.color),
				'stroke-width': metrics.nominalLineWidth,
				'stroke-dasharray': metrics.dashPattern.join(' '),
				'stroke-linecap': a.lineStyle === 'dotted' ? 'round' : 'butt',
			},
			group,
		);
		let d: string;
		if (edge.route) {
			const start = project(edge.route.start);
			d = `M ${start.x} ${start.y}`;
			for (const command of edge.route.commands) {
				const end = project(command.to);
				if (command.kind === 'line') d += ` L ${end.x} ${end.y}`;
				else if (command.kind === 'quadratic') {
					const c = project(command.control);
					d += ` Q ${c.x} ${c.y} ${end.x} ${end.y}`;
				} else {
					const c1 = project(command.control1),
						c2 = project(command.control2);
					d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
				}
			}
		} else {
			const start = project(graph.getNodeAttributes(edge.source)),
				end = project(graph.getNodeAttributes(edge.target));
			const lane = getCanonicalParallelLane(a) * metrics.laneStep;
			const routed =
				state.parallelEdgeStyle === 'curve'
					? createParallelCurveRoute(
							start,
							end,
							radius(edge.source),
							radius(edge.target),
							lane,
						)
					: createParallelCanvasRoute(
							start,
							end,
							radius(edge.source),
							radius(edge.target),
							lane,
						);
			if (edge.source === edge.target) {
				const r = radius(edge.source) + 20 + Math.abs(lane);
				d = `M ${start.x} ${start.y - radius(edge.source)} C ${start.x - r * 2} ${start.y - r * 3} ${start.x + r * 2} ${start.y - r * 3} ${start.x + radius(edge.source)} ${start.y}`;
			} else
				d = (routed?.points ?? [start, end])
					.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`)
					.join(' ');
		}
		path.setAttribute('d', d);
		const length = path.getTotalLength();
		if (edge.directed && length > 0) {
			const placement = edge.route?.arrow;
			const tip = placement
				? project(placement.position)
				: path.getPointAtLength(length);
			const previous = placement
				? project({
						x: placement.position.x - Math.cos(placement.angle),
						y: placement.position.y - Math.sin(placement.angle),
					})
				: path.getPointAtLength(Math.max(0, length - 1));
			const angle =
				(Math.atan2(tip.y - previous.y, tip.x - previous.x) * 180) /
				Math.PI;
			const arrow = draw.element(
				'g',
				{ transform: `translate(${tip.x} ${tip.y}) rotate(${angle})` },
				group,
			);
			if (a.arrowStyle === 'chevron')
				draw.element(
					'path',
					{
						d: `M ${-metrics.arrowLength} ${-metrics.arrowHalfWidth} L 0 0 L ${-metrics.arrowLength} ${metrics.arrowHalfWidth}`,
						fill: 'none',
						stroke: draw.color(a.color),
						'stroke-width': Math.max(
							1,
							metrics.arrowHalfWidth * 0.3,
						),
					},
					arrow,
				);
			else
				draw.element(
					'polygon',
					{
						points: `0,0 ${-metrics.arrowLength},${-metrics.arrowHalfWidth} ${-metrics.arrowLength},${metrics.arrowHalfWidth}`,
						fill: draw.color(a.color),
					},
					arrow,
				);
		}
		if (edge.runtimeIds.some((id) => visibility.edgeIds.has(id))) {
			const placement = edge.route?.label;
			const point = placement
				? project(placement.position)
				: path.getPointAtLength(length / 2);
			const labelGroup = draw.element(
				'g',
				{ 'data-edge-label': edge.id },
				labels,
			);
			draw.label(
				a.label,
				point,
				0,
				labelSize,
				state,
				theme,
				labelGroup,
				placement ? -placement.angle : undefined,
				1,
				true,
			);
		}
	}
	graph.forEachNode((id, attributes) => {
		if (attributes.hidden || attributes.isBend) return;
		const point = project(attributes);
		const group = draw.element(
			'g',
			{ 'data-node-id': id, opacity: attributes.opacity ?? 1 },
			nodes,
		);
		draw.shape(
			attributes.type ?? 'circle',
			point,
			radius(id),
			attributes.color,
			group,
		);
		if (visibility.nodeIds.has(id))
			draw.label(
				attributes.label,
				point,
				radius(id),
				labelSize,
				state,
				theme,
				labels,
				attributes.labelRotation,
				attributes.labelDirection,
			);
	});
	if (!nodes.children.length) throw new Error('No visible graph to export');
	// Measurement uses real SVG text/geometry; the exported document has no host CSS.
	svg.classList.add('knowledge-workspace-svg-measure');
	canvas.parentElement!.appendChild(svg);
	try {
		let bounds =
			options.range === 'graph'
				? content.getBBox()
				: { x: 0, y: 0, width, height };
		if (options.legend) {
			const legend = buildGraphLegend(
				state,
				input.metadataFields,
				input.metadataTypes,
			);
			const entries = [...legend.nodes, ...legend.links];
			const x =
				options.range === 'graph'
					? bounds.x + bounds.width + 30
					: Math.max(16, width - 320);
			const y = options.range === 'graph' ? bounds.y : 16;
			const group = draw.element(
				'g',
				{ 'data-layer': 'legend' },
				content,
			);
			draw.element(
				'rect',
				{
					x,
					y,
					width: 300,
					height: entries.length * 26 + 40,
					rx: 6,
					fill: draw.color(palette.background ?? '#fff'),
					stroke: draw.color(palette.edge),
				},
				group,
			);
			draw.text('Legend', x + 12, y + 18, 14, theme.textColor, group);
			entries.forEach((entry, index) => {
				const rowY = y + 44 + index * 26;
				if (entry.node)
					draw.shape(
						entry.node.shape,
						{ x: x + 22, y: rowY },
						6,
						entry.node.color,
						group,
					);
				else if (entry.line)
					draw.element(
						'path',
						{
							d: `M ${x + 10} ${rowY} L ${x + 34} ${rowY}`,
							fill: 'none',
							stroke: draw.color(entry.line.color),
							'stroke-width': entry.line.size,
							opacity: entry.line.opacity,
						},
						group,
					);
				draw.context.font = `12px ${draw.fontFamily}`;
				draw.text(
					truncateLabel(
						entry.name,
						240,
						(text) => draw.context.measureText(text).width,
					),
					x + 44,
					rowY,
					12,
					theme.textColor,
					group,
				);
			});
			if (options.range === 'viewport') {
				const fit = Math.min(
					1,
					Math.max(1, height - 32) / (entries.length * 26 + 40),
					Math.max(1, width - 32) / 300,
				);
				group.setAttribute(
					'transform',
					`translate(${x} ${y}) scale(${fit}) translate(${-x} ${-y})`,
				);
			}
			if (options.range === 'graph') bounds = content.getBBox();
		}
		const padding =
			options.range === 'graph' ? Math.max(30, strokePadding + 2) : 0;
		const outputWidth = Math.max(1, Math.ceil(bounds.width + padding * 2)),
			outputHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));
		svg.setAttribute(
			'viewBox',
			`${bounds.x - padding} ${bounds.y - padding} ${outputWidth} ${outputHeight}`,
		);
		svg.setAttribute('width', String(outputWidth));
		svg.setAttribute('height', String(outputHeight));
		if (options.background !== 'transparent') {
			const background = draw.element('rect', {
				x: bounds.x - padding,
				y: bounds.y - padding,
				width: outputWidth,
				height: outputHeight,
				fill: draw.color(
					options.background === 'white'
						? '#ffffff'
						: (palette.background ?? '#ffffff'),
				),
			});
			svg.insertBefore(background, content);
		}
		svg.removeAttribute('class');
		if (isStale()) throw new Error('Export cancelled');
		return new Blob([new XMLSerializer().serializeToString(svg)], {
			type: 'image/svg+xml;charset=utf-8',
		});
	} finally {
		svg.remove();
	}
}

function drawGroups(
	draw: SvgDrawing,
	parent: Element,
	graph: RuntimeGraph,
	layout: LayoutSnapshot,
	state: WorkspaceState,
	project: Project,
	scale: number,
	labelSize: number,
	background: string,
): void {
	const drawn = new Set<string>();
	const frame = (
		id: string,
		name: string,
		color: string,
		x: number,
		y: number,
		width: number,
		height: number,
		circle = false,
		titleCenter?: GraphPosition,
		flow = false,
	) => {
		if (drawn.has(id)) return;
		drawn.add(id);
		const group = draw.element('g', { 'data-group-id': id }, parent);
		const style = {
			fill: draw.color(color),
			'fill-opacity': 0.1,
			stroke: draw.color(color),
			'stroke-width': 1,
		};
		if (circle)
			draw.element(
				'ellipse',
				{
					cx: x + width / 2,
					cy: y + height / 2,
					rx: width / 2,
					ry: height / 2,
					...style,
				},
				group,
			);
		else
			draw.element(
				'rect',
				{ x, y, width, height, rx: 6, ...style },
				group,
			);
		draw.capsule(
			name,
			titleCenter ?? { x: x + width / 2, y: y + 12 },
			color,
			background,
			group,
			flow
				? {
						size: labelSize,
						bold: state.labelBold,
						italic: state.labelItalic,
					}
				: undefined,
		);
	};
	const graphFrame = (
		id: string,
		name: string,
		color: string,
		rect: {
			x: number;
			y: number;
			width: number;
			height: number;
			titleBandHeight?: number;
		},
		circle = false,
	) => {
		const a = project(rect),
			b = project({ x: rect.x + rect.width, y: rect.y + rect.height });
		frame(
			id,
			name,
			color,
			Math.min(a.x, b.x),
			Math.min(a.y, b.y),
			Math.abs(b.x - a.x),
			Math.abs(b.y - a.y),
			circle,
			rect.titleBandHeight
				? project({
						x: rect.x + rect.width / 2,
						y: rect.y + rect.height - rect.titleBandHeight / 2,
					})
				: undefined,
			Boolean(rect.titleBandHeight),
		);
	};
	if (state.mode === 'free')
		for (const definition of state.grouping.groups) {
			const rect = state.manualLayout.groupFrames?.[definition.id];
			if (rect)
				graphFrame(
					definition.id,
					definition.name,
					definition.color,
					rect,
					definition.shape !== 'rectangle',
				);
		}
	for (const geometry of layout.groupGeometries) {
		if (geometry.kind === 'flow-container')
			graphFrame(
				geometry.groupId,
				geometry.name,
				geometry.color,
				geometry,
			);
		else if (geometry.kind === 'arc-band') {
			const vertical =
				geometry.direction === 'left' || geometry.direction === 'right';
			graphFrame(geometry.groupId, geometry.name, geometry.color, {
				x: vertical ? -geometry.halfWidth : geometry.start,
				y: vertical ? geometry.start : -geometry.halfWidth,
				width: vertical
					? geometry.halfWidth * 2
					: geometry.end - geometry.start,
				height: vertical
					? geometry.end - geometry.start
					: geometry.halfWidth * 2,
			});
		} else if (geometry.kind === 'radial-sector') {
			const points: GraphPosition[] = [];
			for (const [radius, reverse] of [
				[geometry.outerRadius, false],
				[geometry.innerRadius, true],
			] as const)
				for (let i = 0; i <= 64; i++) {
					const angle =
						geometry.startAngle +
						(geometry.endAngle - geometry.startAngle) *
							(reverse ? 1 - i / 64 : i / 64) -
						Math.PI / 2;
					points.push(
						project({
							x: Math.cos(angle) * radius,
							y: Math.sin(angle) * radius,
						}),
					);
				}
			const group = draw.element(
				'g',
				{ 'data-group-id': geometry.groupId },
				parent,
			);
			draw.element(
				'polygon',
				{
					points: points.map((p) => `${p.x},${p.y}`).join(' '),
					fill: draw.color(geometry.color),
					'fill-opacity': 0.1,
					stroke: draw.color(geometry.color),
				},
				group,
			);
			const point = points[32]!;
			draw.capsule(
				geometry.name,
				point,
				geometry.color,
				background,
				group,
			);
		} else {
			const points = geometry.nodeIds
				.filter(
					(id) =>
						graph.hasNode(id) &&
						!graph.getNodeAttribute(id, 'hidden'),
				)
				.map((id) => {
					const node = graph.getNodeAttributes(id);
					return { ...project(node), radius: node.size * scale };
				});
			if (!points.length) continue;
			const left = Math.min(...points.map((p) => p.x - p.radius)),
				right = Math.max(...points.map((p) => p.x + p.radius)),
				top = Math.min(...points.map((p) => p.y - p.radius)),
				bottom = Math.max(...points.map((p) => p.y + p.radius));
			const padding = 16 + labelSize;
			const definition = state.grouping.groups.find(
				(g) => g.id === geometry.groupId,
			);
			frame(
				geometry.groupId,
				geometry.name,
				geometry.color,
				left - padding,
				top - padding,
				right - left + padding * 2,
				bottom - top + padding * 2,
				definition?.shape !== 'rectangle',
			);
		}
	}
}
