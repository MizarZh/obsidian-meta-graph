import { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import { Force3DRenderer } from './force-3d/force-3d-renderer';
import {
	type GraphRenderer,
	type RendererCapabilities,
	type RendererKind,
} from './renderer-capabilities';

const FORCE_3D_CAPABILITIES: RendererCapabilities = {
	kind: 'force-3d',
	supportsGroupOverlay: false,
	supportsLayoutGroupGeometry: false,
	supportsManualLayout: false,
	supportsEdgePicking: true,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: true,
};

const CUBE_3D_CAPABILITIES: RendererCapabilities = {
	kind: 'cube-3d',
	supportsGroupOverlay: false,
	supportsLayoutGroupGeometry: false,
	supportsManualLayout: true,
	supportsEdgePicking: false,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: true,
};

const SIGMA_CAPABILITIES: RendererCapabilities = {
	kind: 'sigma',
	supportsGroupOverlay: true,
	supportsLayoutGroupGeometry: true,
	supportsManualLayout: false,
	supportsEdgePicking: true,
	supportsNodeDragging: true,
	supportsConnectionMoveScheduling: false,
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
