import { bindCube3DEvents, type Cube3DRenderer } from './cube-3d-renderer';
import { bindForce3DEvents, type Force3DRenderer } from './force-3d-renderer';
import { bindGraphEvents, type GraphEventCallbacks } from './graph-events';
import {
	isCube3DRenderer,
	isForce3DRenderer,
	type GraphRenderer,
} from './renderer-adapter';
import type { SigmaRenderer } from './sigma-renderer';

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
