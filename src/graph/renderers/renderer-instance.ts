import { Cube3DRenderer } from '@/graph/renderers/cube-3d/cube-3d-renderer';
import { Force3DRenderer } from '@/graph/renderers/force-3d/force-3d-renderer';
import { G6Renderer } from '@/graph/renderers/g6/g6-renderer';
import {
	type GraphRenderer,
	type RendererCapabilities,
	type RendererKind,
} from '@/graph/renderers/renderer-capabilities';
import type {
	ForceSimulationRenderer,
	PlanarRenderer,
} from '@/graph/renderers/renderer-contracts';
import { SigmaRenderer } from '@/graph/renderers/sigma/sigma-renderer';

const FORCE_3D_CAPABILITIES: RendererCapabilities = {
	kind: 'force-3d',
	supportsGroupOverlay: false,
	supportsLayoutGroupGeometry: false,
	supportsManualLayout: false,
	supportsEdgePicking: true,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: true,
	supportsExternal2DForceSimulation: false,
};

const CUBE_3D_CAPABILITIES: RendererCapabilities = {
	kind: 'cube-3d',
	supportsGroupOverlay: false,
	supportsLayoutGroupGeometry: false,
	supportsManualLayout: true,
	supportsEdgePicking: false,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: true,
	supportsExternal2DForceSimulation: false,
};

const SIGMA_CAPABILITIES: RendererCapabilities = {
	kind: 'sigma',
	supportsGroupOverlay: true,
	supportsLayoutGroupGeometry: true,
	supportsManualLayout: false,
	supportsEdgePicking: true,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: false,
	supportsExternal2DForceSimulation: true,
};

export function getRendererCapabilities(
	renderer: GraphRenderer,
): RendererCapabilities {
	const declared = renderer.capabilities;
	if (declared) {
		return declared;
	}
	if (renderer instanceof Force3DRenderer) {
		return FORCE_3D_CAPABILITIES;
	}
	if (renderer instanceof Cube3DRenderer) {
		return CUBE_3D_CAPABILITIES;
	}
	return SIGMA_CAPABILITIES;
}

export function getRendererKind(renderer: GraphRenderer): RendererKind {
	return getRendererCapabilities(renderer).kind;
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

export function isPlanarRenderer(
	renderer: GraphRenderer,
): renderer is PlanarRenderer {
	const kind = getRendererCapabilities(renderer).kind;
	return kind === 'sigma' || kind === 'g6';
}

export function isForceSimulationRenderer(
	renderer: GraphRenderer,
): renderer is PlanarRenderer & ForceSimulationRenderer {
	return (
		isPlanarRenderer(renderer) &&
		getRendererCapabilities(renderer).supportsExternal2DForceSimulation
	);
}

export function isSigmaRenderer(
	renderer: GraphRenderer,
): renderer is SigmaRenderer {
	return renderer instanceof SigmaRenderer;
}

export function isG6Renderer(renderer: GraphRenderer): renderer is G6Renderer {
	return renderer instanceof G6Renderer;
}
