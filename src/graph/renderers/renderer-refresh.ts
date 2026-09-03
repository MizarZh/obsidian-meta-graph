import type { ManualLayoutConfig } from '../../core/types';
import {
	getRendererCapabilities,
	isCube3DRenderer,
	isForce3DRenderer,
} from './renderer-instance';
import type { GraphRenderer } from './renderer-capabilities';
import type { GraphPalette } from '../styles/graph-styles';

export function setRendererPalette(
	renderer: GraphRenderer,
	palette: GraphPalette,
): void {
	renderer.setPalette(palette);
}

export function setRendererManualLayout(
	renderer: GraphRenderer,
	manualLayout: ManualLayoutConfig,
): void {
	if (
		!getRendererCapabilities(renderer).supportsManualLayout ||
		!isCube3DRenderer(renderer)
	) {
		return;
	}
	renderer.setManualLayout(manualLayout);
}

export function refreshRendererGraphStyles(renderer: GraphRenderer): void {
	if (isForce3DRenderer(renderer)) {
		renderer.refreshGraphStyles();
		return;
	}
	if (isCube3DRenderer(renderer)) {
		renderer.setGraph(renderer.runtimeGraph);
		return;
	}
	renderer.refresh();
}

export function refreshRendererGraphVisibility(
	renderer: GraphRenderer,
	changes: { nodeIds: readonly string[]; edgeIds: readonly string[] },
): void {
	if (isForce3DRenderer(renderer)) {
		renderer.refreshGraphStyles();
		return;
	}
	if (isCube3DRenderer(renderer)) {
		renderer.setGraph(renderer.runtimeGraph);
		return;
	}
	renderer.instance.refresh({
		partialGraph: {
			nodes: [...changes.nodeIds],
			edges: [...changes.edgeIds],
		},
		skipIndexation: true,
		schedule: true,
	});
}
