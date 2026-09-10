import type { Cube3DRenderer } from '@/graph/renderers/cube-3d/cube-3d-renderer';
import type { Force3DRenderer } from '@/graph/renderers/force-3d/force-3d-renderer';
import type { G6Renderer } from '@/graph/renderers/g6/g6-renderer';
import {
	type GraphRenderer,
	type RendererCapabilities,
	type RendererKind,
} from '@/graph/renderers/renderer-capabilities';
import type {
	ForceSimulationRenderer,
	PlanarRenderer,
} from '@/graph/renderers/renderer-contracts';
import type { SigmaRenderer } from '@/graph/renderers/sigma/sigma-renderer';

export function getRendererCapabilities(
	renderer: GraphRenderer,
): RendererCapabilities {
	return renderer.capabilities;
}

export function getRendererKind(renderer: GraphRenderer): RendererKind {
	return getRendererCapabilities(renderer).kind;
}

export function isForce3DRenderer(
	renderer: GraphRenderer,
): renderer is Force3DRenderer {
	return getRendererKind(renderer) === 'force-3d';
}

export function isCube3DRenderer(
	renderer: GraphRenderer,
): renderer is Cube3DRenderer {
	return getRendererKind(renderer) === 'cube-3d';
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
	return getRendererKind(renderer) === 'sigma';
}

export function isG6Renderer(renderer: GraphRenderer): renderer is G6Renderer {
	return getRendererKind(renderer) === 'g6';
}
