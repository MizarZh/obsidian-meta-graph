import type { ViewMode } from '../../core/types';
import type { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import type { Force3DRenderer } from './force-3d/force-3d-renderer';
import type { SigmaRenderer } from './sigma/sigma-renderer';

export type RendererKind = 'sigma' | 'force-3d' | 'cube-3d';

/** Capabilities describe implementation support, independent of active chart mode. */
export interface RendererCapabilities {
	kind: RendererKind;
	supportsGroupOverlay: boolean;
	supportsLayoutGroupGeometry: boolean;
	supportsManualLayout: boolean;
	supportsEdgePicking: boolean;
	supportsNodeDragging: boolean;
	supportsConnectionMoveScheduling: boolean;
}

export type GraphRenderer = SigmaRenderer | Force3DRenderer | Cube3DRenderer;

export interface ModeCapabilities {
	rendererKind: RendererKind;
	usesSigmaForceSimulation: boolean;
	supportsFreeNodeDrag: boolean;
	supportsGroups: boolean;
	supportsManualGroups: boolean;
}

const MODE_CAPABILITIES: Record<ViewMode, ModeCapabilities> = {
	graph: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: true,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	'graph-3d': {
		rendererKind: 'force-3d',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: false,
		supportsManualGroups: false,
	},
	cube: {
		rendererKind: 'cube-3d',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	free: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: true,
		supportsGroups: true,
		supportsManualGroups: true,
	},
	flow: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	arc: {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	'hierarchical-edge-bundling': {
		rendererKind: 'sigma',
		usesSigmaForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
};

export function getModeCapabilities(mode: ViewMode): ModeCapabilities {
	return MODE_CAPABILITIES[mode];
}

export function getRendererKindForMode(mode: ViewMode): RendererKind {
	return getModeCapabilities(mode).rendererKind;
}
