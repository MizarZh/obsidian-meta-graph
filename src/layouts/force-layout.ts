import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export class ForceAtlasLayout implements LayoutEngine {
	constructor(private readonly spacing = 1) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		graph.forEachNode((node, attributes) => {
			graph.setNodeAttribute(node, 'fixed', false);
			if (!Number.isFinite(attributes.x) || !Number.isFinite(attributes.y)) {
				graph.mergeNodeAttributes(node, {
					x: 0,
					y: 0,
				});
			}
		});
		graph.forEachEdge((edge) => graph.setEdgeAttribute(edge, 'hidden', false));

		if (graph.order < 2) {
			return;
		}

		forceAtlas2.assign(graph, {
			iterations: graph.order < 50 ? 150 : 250,
			settings: getForceAtlasSettings(graph, this.spacing),
		});
	}

}

function getForceAtlasSettings(graph: RuntimeGraph, spacing: number) {
	return {
		...forceAtlas2.inferSettings(graph),
		barnesHutOptimize: graph.order > 80,
		gravity: 1,
		scalingRatio: 4 * spacing * spacing,
		slowDown: 2,
	};
}
