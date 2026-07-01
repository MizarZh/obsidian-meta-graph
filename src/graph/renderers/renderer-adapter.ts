import type {
	LabelPosition,
	ManualLayoutConfig,
	ViewMode,
} from '../../core/types';
import type { RuntimeGraph } from '../model/graphology-adapter';
import type { GraphPalette } from '../styles/graph-styles';
import { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import { Force3DRenderer } from './force-3d/force-3d-renderer';
import { SigmaRenderer } from './sigma/sigma-renderer';

export type GraphRenderer = SigmaRenderer | Force3DRenderer | Cube3DRenderer;
export type RendererKind = 'sigma' | 'force-3d' | 'cube-3d';

export interface ModeCapabilities {
	rendererKind: RendererKind;
	usesSigmaForceSimulation: boolean;
	supportsFreeNodeDrag: boolean;
	supportsManualGroups: boolean;
}

export interface GraphRendererOptions {
	graph: RuntimeGraph;
	container: HTMLElement;
	palette: GraphPalette;
	kind: RendererKind;
	manualLayout: ManualLayoutConfig;
	fadeDistance: number;
	labelSize: number;
	labelPosition: LabelPosition;
	labelOffset: number;
	labelColor: string;
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
	labelBackgroundOpacity: number;
	labelDensity: number;
	cubeFaceOpacity: number;
	enableForceLayout: boolean;
	forceLabels: boolean;
	isStale: () => boolean;
}

const MODE_CAPABILITIES: Record<ViewMode, ModeCapabilities> = {
	graph: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: true,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
	'graph-3d': {
		rendererKind: 'force-3d',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
	cube: {
		rendererKind: 'cube-3d',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
	free: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: true,
		supportsManualGroups: true,
	},
	flow: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
	arc: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
	'hierarchical-edge-bundling': {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsManualGroups: false,
	},
};

export function getModeCapabilities(mode: ViewMode): ModeCapabilities {
	return MODE_CAPABILITIES[mode];
}

export function getRendererKindForMode(mode: ViewMode): RendererKind {
	return getModeCapabilities(mode).rendererKind;
}

export function getRendererKind(renderer: GraphRenderer): RendererKind {
	if (isForce3DRenderer(renderer)) {
		return 'force-3d';
	}

	if (isCube3DRenderer(renderer)) {
		return 'cube-3d';
	}

	return 'sigma';
}

export function isForce3DRenderer(
	renderer: GraphRenderer,
): renderer is Force3DRenderer {
	return renderer instanceof Force3DRenderer;
}

export function isCube3DRenderer(
	renderer: GraphRenderer,
): renderer is Cube3DRenderer {
	return renderer instanceof Cube3DRenderer;
}

export function setRendererPalette(
	renderer: GraphRenderer,
	palette: GraphPalette,
): void {
	if (isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) {
		renderer.setPalette(palette);
		return;
	}
	renderer.setPalette(palette);
}

export function setRendererManualLayout(
	renderer: GraphRenderer,
	manualLayout: ManualLayoutConfig,
): void {
	if (isCube3DRenderer(renderer)) {
		renderer.setManualLayout(manualLayout);
	}
}

export function refreshRendererGraphStyles(renderer: GraphRenderer): void {
	if (isForce3DRenderer(renderer) || isCube3DRenderer(renderer)) {
		renderer.setGraph(renderer.runtimeGraph);
		return;
	}
	renderer.instance.refresh();
}

export async function createGraphRenderer(
	options: GraphRendererOptions,
): Promise<GraphRenderer | undefined> {
	if (options.kind === 'force-3d') {
		return Force3DRenderer.create(
			options.graph,
			options.container,
			options.palette,
			options.fadeDistance,
			options.labelSize,
			options.labelPosition,
			options.labelColor,
			options.labelBackgroundOpacity,
			options.labelDensity,
			options.enableForceLayout,
			options.forceLabels,
			options.isStale,
			options.labelOffset,
			options.labelLightTextColor,
			options.labelLightBackgroundColor,
			options.labelLightBackgroundOpacity,
			options.labelDarkTextColor,
			options.labelDarkBackgroundColor,
			options.labelDarkBackgroundOpacity,
		);
	}

	if (options.kind === 'cube-3d') {
		return Cube3DRenderer.create(
			options.graph,
			options.container,
			options.palette,
			options.manualLayout,
			options.fadeDistance,
			options.labelSize,
			options.labelPosition,
			options.labelColor,
			options.labelBackgroundOpacity,
			options.labelDensity,
			options.cubeFaceOpacity,
			options.enableForceLayout,
			options.forceLabels,
			options.isStale,
			options.labelOffset,
			options.labelLightTextColor,
			options.labelLightBackgroundColor,
			options.labelLightBackgroundOpacity,
			options.labelDarkTextColor,
			options.labelDarkBackgroundColor,
			options.labelDarkBackgroundOpacity,
		);
	}

	return new SigmaRenderer(
		options.graph,
		options.container,
		options.palette,
			options.fadeDistance,
			options.labelSize,
			options.labelPosition,
			options.labelOffset,
			options.labelColor,
		options.labelBackgroundOpacity,
		options.labelDensity,
		options.forceLabels,
		options.labelLightTextColor,
		options.labelLightBackgroundColor,
		options.labelLightBackgroundOpacity,
		options.labelDarkTextColor,
		options.labelDarkBackgroundColor,
		options.labelDarkBackgroundOpacity,
	);
}
