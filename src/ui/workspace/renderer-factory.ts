import type { WorkspaceState } from '../../core/types';
import type { RuntimeGraph } from '../../graph/model/graphology-adapter';
import type { GraphPalette } from '../../graph/styles/graph-styles';
import {
	createGraphRenderer,
	getRendererKindForMode,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';
import { createCubeRendererManualLayout } from '../../workspace/state/manual-layout/cube-layout';

export interface WorkspaceGraphRendererOptions {
	graph: RuntimeGraph;
	container: HTMLElement;
	palette: GraphPalette;
	state: WorkspaceState;
	isStale: () => boolean;
}

export function createWorkspaceGraphRenderer(
	options: WorkspaceGraphRendererOptions,
): Promise<GraphRenderer | undefined> {
	const { graph, container, palette, state, isStale } = options;
	return createGraphRenderer({
		graph,
		container,
		palette,
		kind: getRendererKindForMode(state.mode),
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
		labelColor: state.labelColor,
		labelLightTextColor: state.labelLightTextColor,
		labelLightBackgroundColor: state.labelLightBackgroundColor,
		labelLightBackgroundOpacity: state.labelLightBackgroundOpacity,
		labelDarkTextColor: state.labelDarkTextColor,
		labelDarkBackgroundColor: state.labelDarkBackgroundColor,
		labelDarkBackgroundOpacity: state.labelDarkBackgroundOpacity,
		labelBackgroundOpacity: state.labelBackgroundOpacity,
		labelDensity: state.labelDensity,
		cubeFaceOpacity: state.cubeFaceOpacity,
		cubeSize: state.cubeSize,
		cubeFreeCamera: state.cubeFreeCamera,
		enableForceLayout: state.enableForceLayout,
		forceLabels: state.forceLabels,
		isStale,
	});
}
