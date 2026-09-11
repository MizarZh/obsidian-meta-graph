import type { WorkspaceState } from '@/core/types';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type { PlanarEdgeRoute } from '@/layouts/planar-geometry';
import type { GraphPalette } from '@/graph/styles/graph-styles';
import {
	createGraphRenderer,
	getRendererKindForMode,
	type GraphRenderer,
} from '@/graph/renderers/renderer-adapter';
import { createCubeRendererManualLayout } from '@/workspace/state/manual-layout/cube-layout';

export interface WorkspaceGraphRendererOptions {
	exportPixelRatio?: number;
	graph: RuntimeGraph;
	container: HTMLElement;
	palette: GraphPalette;
	state: WorkspaceState;
	isStale: () => boolean;
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>;
}

export function createWorkspaceGraphRenderer(
	options: WorkspaceGraphRendererOptions,
): Promise<GraphRenderer | undefined> {
	const { graph, container, palette, state, isStale } = options;
	return createGraphRenderer({
		exportPixelRatio: options.exportPixelRatio,
		graph,
		container,
		palette,
		kind: getRendererKindForMode(state.mode, state.renderer),
		manualLayout:
			state.mode === 'cube'
				? createCubeRendererManualLayout(
						state.charts.find(
							(chart) => chart.id === state.activeChartId,
						)?.layout ?? {
							engine: 'cube-3d',
							spacing: 1,
							manual: state.manualLayout,
						},
						state.grouping,
					)
				: state.manualLayout,
		fadeDistance: state.fadeDistance,
		labelSize: state.labelSize,
		scaleLabelsWithZoom: state.scaleLabelsWithZoom,
		threeLabelResolution: state.threeLabelResolution,
		labelBold: state.labelBold,
		labelItalic: state.labelItalic,
		labelPosition: state.labelPosition,
		labelOffset: state.labelOffset,
		labelMaxWidth: state.labelMaxWidth,
		labelLightTextColor: state.labelLightTextColor,
		labelLightBackgroundColor: state.labelLightBackgroundColor,
		labelLightBackgroundOpacity: state.labelLightBackgroundOpacity,
		labelDarkTextColor: state.labelDarkTextColor,
		labelDarkBackgroundColor: state.labelDarkBackgroundColor,
		labelDarkBackgroundOpacity: state.labelDarkBackgroundOpacity,
		labelDensity: state.labelDensity,
		cubeFaceOpacity: state.cubeFaceOpacity,
		parallelEdgeStyle:
			state.mode === 'graph'
				? (state.parallelEdgeStyle ?? 'straight')
				: 'straight',
		cubeSize: state.cubeSize,
		cubeFreeCamera: state.cubeFreeCamera,
		enableForceLayout: state.enableForceLayout,
		forceLabels: state.forceLabels,
		isStale,
		edgeRoutes: options.edgeRoutes,
	});
}
