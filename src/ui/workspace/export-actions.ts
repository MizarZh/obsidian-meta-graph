import { Notice, type App } from 'obsidian';
import type { WorkspaceState } from '@/core/types';
import { supportsPlanarRenderer } from '@/core/types';
import { ExportModal } from '@/ui/ExportModal';
import { createPngExport } from '@/workspace/export/png-export';
import { saveExport } from '@/workspace/export/export-file';
import {
	createEntryDocument,
	selectExportEntries,
	serializeEntries,
} from '@/workspace/export/entry-export';
import { isPlanarRenderer } from '@/graph/renderers/renderer-adapter';
import {
	createWorkspaceGroupByNode,
	type WorkspaceRendererLifecycle,
} from '@/ui/workspace/renderer-lifecycle';
import type { LayoutSnapshot } from '@/layouts/stable-layout';

export interface WorkspaceExportContext {
	readonly app: App;
	readonly state: WorkspaceState;
	readonly canvas: HTMLElement;
	readonly loading: boolean;
	readonly metadataFields: string[];
	readonly metadataTypes: Record<string, string>;
	lifecycle: Pick<WorkspaceRendererLifecycle, 'renderer' | 'generation'>;
	getLayoutSnapshot(): LayoutSnapshot;
}

export function createWorkspaceExport(context: WorkspaceExportContext) {
	function openExport(): void {
		const renderer = context.lifecycle.renderer;
		if (
			(!renderer && !context.state.projection) ||
			context.loading ||
			!context.canvas?.isConnected
		) {
			new Notice('Graph is not ready');
			return;
		}
		const chartId = context.state.activeChartId;
		const { width, height } = context.canvas.getBoundingClientRect();
		const visibleEntries = context.state.projection
			? selectExportEntries(
					context.state.projection,
					renderer?.runtimeGraph,
				)
			: undefined;
		new ExportModal(context.app, {
			name:
				context.state.charts.find((chart) => chart.id === chartId)
					?.name ?? 'Graph',
			planar: supportsPlanarRenderer(context.state.mode),
			width,
			height,
			showLegend: context.state.showLegend,
			imageAvailable: Boolean(renderer),
			hasSelection: Boolean(
				context.state.selectedNodeId ||
				context.state.selectedEdgeId ||
				context.state.selectedGroupId,
			),
			nodeCount: visibleEntries?.nodes.length ?? 0,
			edgeCount: visibleEntries?.edges.length ?? 0,
			onExport: async (options, isCancelled) => {
				if (context.loading)
					throw new Error(
						'Graph is updating. Try again when it is ready.',
					);
				const generation = context.lifecycle.generation;
				const isStale = () =>
					isCancelled() ||
					!context.canvas?.isConnected ||
					context.lifecycle.renderer !== renderer ||
					context.lifecycle.generation !== generation ||
					context.state.activeChartId !== chartId;
				if (isStale()) throw new Error('Export cancelled');
				if (
					options.format === 'json' ||
					options.format === 'csv' ||
					options.format === 'md'
				) {
					const data = createEntryDocument(
						context.state,
						options,
						renderer?.runtimeGraph,
						createWorkspaceGroupByNode(context.state),
					);
					const blob = serializeEntries(
						data,
						options.format,
						options.includeMetadata,
					);
					return saveExport(
						context.app,
						options.filename,
						options.format,
						blob,
						isStale,
					);
				}
				if (!renderer) throw new Error('Graph is not ready');
				const input = {
					renderer,
					canvas: context.canvas,
					state: context.state,
					layout: context.getLayoutSnapshot(),
					options,
					isStale,
					metadataFields: context.metadataFields,
					metadataTypes: context.metadataTypes,
				};
				let blob: Blob;
				if (options.format === 'svg') {
					if (!isPlanarRenderer(renderer))
						throw new Error('SVG export requires a planar chart');
					const { createSvgExport } =
						await import('@/workspace/export/svg-export');
					blob = await createSvgExport({ ...input, renderer });
				} else blob = await createPngExport(input);
				return saveExport(
					context.app,
					options.filename,
					options.format,
					blob,
					isStale,
				);
			},
		}).open();
	}

	return openExport;
}
