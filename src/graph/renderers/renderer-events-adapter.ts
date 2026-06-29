import { bindCube3DEvents } from './cube-3d/cube-3d-events';
import type { Cube3DRenderer } from './cube-3d/cube-3d-renderer';
import { bindForce3DEvents } from './force-3d/force-3d-events';
import type { Force3DRenderer } from './force-3d/force-3d-renderer';
import type { GraphEventCallbacks } from './renderer-events';
import { bindGraphEvents } from './sigma/sigma-events';
import {
	isCube3DRenderer,
	isForce3DRenderer,
	type GraphRenderer,
} from './renderer-adapter';
import type { SigmaRenderer } from './sigma/sigma-renderer';

export interface RendererEventBindings {
	force3d(renderer: Force3DRenderer): GraphEventCallbacks;
	cube3d(renderer: Cube3DRenderer): GraphEventCallbacks;
	sigma(renderer: SigmaRenderer): GraphEventCallbacks;
}

export function bindRendererEvents(
	renderer: GraphRenderer,
	bindings: RendererEventBindings,
): () => void {
	if (isForce3DRenderer(renderer)) {
		return bindForce3DEvents(renderer, bindings.force3d(renderer));
	}

	if (isCube3DRenderer(renderer)) {
		return bindCube3DEvents(renderer, bindings.cube3d(renderer));
	}

	return bindGraphEvents(renderer, bindings.sigma(renderer));
}
