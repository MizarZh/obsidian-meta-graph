import { supportsPlanarRenderer, type PlanarRendererKind, type ViewMode } from '../../core/types';
import type { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import type { Force3DRenderer } from './force-3d/force-3d-renderer';
import type { PlanarRenderer } from './renderer-contracts';

export type { PlanarRendererKind } from '../../core/types';
export type RendererKind = PlanarRendererKind | 'force-3d' | 'cube-3d';

/** Capabilities describe implementation support, independent of active chart mode. */
export interface RendererCapabilities {
	kind: RendererKind;
	supportsGroupOverlay: boolean;
	supportsLayoutGroupGeometry: boolean;
	supportsManualLayout: boolean;
	supportsEdgePicking: boolean;
	supportsNodeDragging: boolean;
	supportsConnectionMoveScheduling: boolean;
	supportsExternal2DForceSimulation: boolean;
}

export type GraphRenderer = PlanarRenderer | Force3DRenderer | Cube3DRenderer;

export interface ModeCapabilities {
	rendererKind: RendererKind;
	usesExternal2DForceSimulation: boolean;
	supportsFreeNodeDrag: boolean;
	supportsGroups: boolean;
	supportsManualGroups: boolean;
}

const MODE_CAPABILITIES: Record<ViewMode, ModeCapabilities> = {
	graph: {
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: true,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	'graph-3d': {
		rendererKind: 'force-3d',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: false,
		supportsManualGroups: false,
	},
	cube: {
		rendererKind: 'cube-3d',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	free: {
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: true,
		supportsGroups: true,
		supportsManualGroups: true,
	},
	flow: {
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	arc: {
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
	'hierarchical-edge-bundling': {
		rendererKind: 'sigma',
		usesExternal2DForceSimulation: false,
		supportsFreeNodeDrag: false,
		supportsGroups: true,
		supportsManualGroups: false,
	},
};

export function getModeCapabilities(mode: ViewMode): ModeCapabilities {
	return MODE_CAPABILITIES[mode];
}

export function getRendererKindForMode(
	mode: ViewMode,
	graphRenderer: PlanarRendererKind = 'sigma',
): RendererKind {
	return supportsPlanarRenderer(mode)
		? graphRenderer
		: getModeCapabilities(mode).rendererKind;
}
