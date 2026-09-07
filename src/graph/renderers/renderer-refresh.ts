import type { ManualLayoutConfig } from '@/core/types';
import {
	getRendererCapabilities,
	isCube3DRenderer,
	isForce3DRenderer,
	isPlanarRenderer,
} from '@/graph/renderers/renderer-instance';
import type { GraphRenderer } from '@/graph/renderers/renderer-capabilities';
import type { GraphPalette } from '@/graph/styles/graph-styles';

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
	if (isPlanarRenderer(renderer)) {
		renderer.refreshGraphStyles();
	}
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
	if (isPlanarRenderer(renderer)) {
		renderer.refreshGraphVisibility(changes);
	}
}
