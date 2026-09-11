import { mount, unmount, tick } from 'svelte';
import type { WorkspaceState } from '@/core/types';
import type {
	RuntimeGraph,
	GraphPosition,
} from '@/graph/model/graphology-adapter';
import {
	isPlanarRenderer,
	type GraphRenderer,
} from '@/graph/renderers/renderer-adapter';
import {
	canvasToPng,
	exportDimensions,
	hasClippedExportContent,
	rasterizeSnapshot,
	snapshotElement,
	snapshotPlanarPositions,
	type ExportViewport,
	type PngExportOptions,
} from '@/graph/renderers/renderer-export';
import { readGraphPalette } from '@/graph/styles/graph-styles';
import type { LayoutSnapshot } from '@/layouts/stable-layout';
import { createWorkspaceGraphRenderer } from '@/ui/workspace/renderer-factory';
import { syncWorkspaceRendererGroups } from '@/ui/workspace/renderer-groups';
import { createWorkspaceGroupByNode } from '@/ui/workspace/renderer-lifecycle';
import GraphLegend from '@/ui/workspace/GraphLegend.svelte';

export function graphExportViewport(
	graph: RuntimeGraph,
	layout: LayoutSnapshot,
	state: WorkspaceState,
	width: number,
	height: number,
): ExportViewport {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	const add = (p: GraphPosition) => {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	};
	graph.forEachNode((_id, node) => {
		if (!node.hidden || node.isBend) add(node);
	});
	for (const route of layout.edgeRoutes?.values() ?? []) {
		add(route.start);
		for (const command of route.commands) {
			add(command.to);
			if (command.kind === 'quadratic') add(command.control);
			if (command.kind === 'cubic') {
				add(command.control1);
				add(command.control2);
			}
		}
	}
	for (const frame of Object.values(
		state.mode === 'free' ? (state.manualLayout.groupFrames ?? {}) : {},
	)) {
		add(frame);
		add({ x: frame.x + frame.width, y: frame.y + frame.height });
	}
	for (const group of layout.groupGeometries) {
		if (group.kind === 'flow-container') {
			add(group);
			add({ x: group.x + group.width, y: group.y + group.height });
		}
		if (group.kind === 'radial-sector') {
			add({ x: -group.outerRadius, y: -group.outerRadius });
			add({ x: group.outerRadius, y: group.outerRadius });
		}
		if (group.kind === 'arc-band') {
			const vertical =
				group.direction === 'right' || group.direction === 'left';
			add({
				x: vertical ? -group.halfWidth : group.start,
				y: vertical ? group.start : -group.halfWidth,
			});
			add({
				x: vertical ? group.halfWidth : group.end,
				y: vertical ? group.end : group.halfWidth,
			});
		}
	}
	if (!Number.isFinite(minX)) throw new Error('No visible graph to export');
	// Reserve room for labels, arrowheads and dynamic group padding.
	return {
		center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
		unitsPerPixel: Math.max(
			(maxX - minX || 1) / Math.max(1, width * 0.6),
			(maxY - minY || 1) / Math.max(1, height * 0.6),
		),
	};
}

export async function createPngExport(input: {
	renderer: GraphRenderer;
	canvas: HTMLElement;
	state: WorkspaceState;
	layout: LayoutSnapshot;
	options: PngExportOptions;
	isStale: () => boolean;
	metadataFields: string[];
	metadataTypes: Record<string, string>;
}): Promise<Blob> {
	const { renderer, canvas, options, isStale } = input;
	const { width, height } = canvas.getBoundingClientRect();
	exportDimensions(width, height, options.scale);
	const check = () => {
		if (isStale()) throw new Error('Export cancelled');
	};
	check();
	const state = structuredClone(input.state);
	const layout = structuredClone(input.layout);
	const graph = renderer.runtimeGraph.copy();
	if (!graph.someNode((_id, node) => !node.hidden && !node.isBend))
		throw new Error('No visible graph to export');
	const palette = readGraphPalette(canvas);
	const background =
		options.background === 'transparent'
			? undefined
			: options.background === 'white'
				? '#ffffff'
				: palette.background;
	const document = canvas.ownerDocument;
	const host = document.createElement('div');
	host.className = 'knowledge-workspace knowledge-workspace-export-host';
	host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
	host.setAttribute('aria-hidden', 'true');
	const scene = document.createElement('div');
	scene.className = 'knowledge-workspace-export-scene';
	host.appendChild(scene);
	canvas.parentElement!.appendChild(host);
	let copy: GraphRenderer | undefined;
	let legend: ReturnType<typeof mount> | undefined;
	try {
		let viewport: ExportViewport | undefined;
		if (isPlanarRenderer(renderer)) {
			snapshotPlanarPositions(graph, (id) =>
				renderer.getNodePosition(id),
			);
			if (options.range === 'graph')
				viewport = graphExportViewport(
					graph,
					layout,
					state,
					width,
					height,
				);
			else {
				const center = renderer.viewportToGraphPosition({
					x: width / 2,
					y: height / 2,
				});
				const next = renderer.viewportToGraphPosition({
					x: width / 2 + 1,
					y: height / 2,
				});
				viewport = {
					center,
					unitsPerPixel: Math.hypot(
						next.x - center.x,
						next.y - center.y,
					),
				};
			}
			copy = await createWorkspaceGraphRenderer({
				graph,
				container: scene,
				palette: {
					...palette,
					background: 'transparent',
					// Transparency is a compositing detail, not a dark theme.
					labelThemeBackground: palette.background,
				},
				state: { ...state, enableForceLayout: false },
				isStale,
				edgeRoutes: layout.edgeRoutes,
				exportPixelRatio: options.scale,
			});
			check();
			if (!copy || !isPlanarRenderer(copy) || !copy.prepareExport)
				throw new Error('Renderer cannot export this chart');
			syncWorkspaceRendererGroups(
				copy,
				state.mode,
				state.manualLayout,
				state.grouping,
				createWorkspaceGroupByNode(state),
				layout,
				false,
				{},
			);
			await copy.prepareExport(viewport, options.scale);
		} else {
			if (options.range !== 'viewport')
				throw new Error('3D charts support the current view only');
			scene.appendChild(
				await renderer.captureExport(options.scale, background),
			);
			const image = scene.firstElementChild as HTMLCanvasElement;
			image.style.width = `${width}px`;
			image.style.height = `${height}px`;
		}
		check();
		if (options.legend) {
			legend = mount(GraphLegend, {
				target: host,
				props: {
					state,
					metadataFields: input.metadataFields,
					metadataTypes: input.metadataTypes,
				},
			});
			await tick();
			const element = host.querySelector<HTMLElement>(
				'.knowledge-workspace-legend',
			);
			if (element) {
				const fit = Math.min(
					1,
					(height - 32) / element.scrollHeight,
					(width - 32) / element.scrollWidth,
				);
				element.style.transform = `scale(${Math.max(0.01, fit)})`;
			}
		}
		await document.fonts.ready;
		check();
		for (let attempt = 0; attempt < 8; attempt++) {
			// Copy WebGL buffers in the same turn as their redraw.
			if (copy && isPlanarRenderer(copy) && viewport)
				await copy.prepareExport!(viewport, options.scale);
			check();
			const snapshot = snapshotElement(
				host,
				options.scale,
			) as HTMLElement;
			// Detached SVG content cannot resolve the workspace stylesheet.
			// eslint-disable-next-line obsidianmd/no-static-styles-assignment -- Exported SVG requires inline positioning outside the Obsidian document.
			snapshot.setCssProps({
				position: 'relative',
				'inset-inline': '0 auto',
				'inset-block': '0 auto',
				background: 'transparent',
			});
			const output = await rasterizeSnapshot(
				snapshot,
				width,
				height,
				options.scale,
			);
			check();
			if (
				options.range === 'graph' &&
				viewport &&
				hasClippedExportContent(output, options.scale)
			) {
				viewport.unitsPerPixel *= 1.4;
				continue;
			}
			if (background) {
				const context = output.getContext('2d')!;
				context.globalCompositeOperation = 'destination-over';
				context.fillStyle = background;
				context.fillRect(0, 0, output.width, output.height);
			}
			return await canvasToPng(output);
		}
		throw new Error(
			'Labels or groups exceed the image bounds. Enlarge the view or reduce Max text width.',
		);
	} finally {
		try {
			if (legend) await unmount(legend);
		} finally {
			try {
				copy?.kill();
			} finally {
				host.remove();
			}
		}
	}
}
