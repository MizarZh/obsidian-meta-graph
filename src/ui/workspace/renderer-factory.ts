import type { WorkspaceState } from '../../core/types';
import type { RuntimeGraph } from '../../graph/model/graphology-adapter';
import type { GraphPalette } from '../../graph/styles/graph-styles';
import {
	createGraphRenderer,
	getRendererKindForMode,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';

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
		manualLayout: state.manualLayout,
		fadeDistance: state.fadeDistance,
		labelSize: state.labelSize,
		labelPosition: state.labelPosition,
		labelColor: state.labelColor,
		labelBackgroundOpacity: state.labelBackgroundOpacity,
		labelDensity: state.labelDensity,
		cubeFaceOpacity: state.cubeFaceOpacity,
		enableForceLayout: state.enableForceLayout,
		forceLabels: state.forceLabels,
		isStale,
	});
}
