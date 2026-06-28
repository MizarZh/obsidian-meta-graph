import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

export interface GraphForceSettings {
	centerForce: number;
	repelForce: number;
	linkForce: number;
	dragLinkForce: number;
	returnForce: number;
	linkDistance: number;
}

export const DEFAULT_GRAPH_FORCE_SETTINGS: GraphForceSettings = {
	centerForce: 1,
	repelForce: 10,
	linkForce: 1,
	dragLinkForce: 1,
	returnForce: 1,
	linkDistance: 250,
};

export class ForceAtlasLayout implements LayoutEngine {
	constructor(
		private readonly spacing = 1,
		private readonly forceSettings: GraphForceSettings = DEFAULT_GRAPH_FORCE_SETTINGS,
	) {}

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
			settings: getForceAtlasSettings(graph, this.spacing, this.forceSettings),
		});
		normalizeLinkDistance(graph, this.spacing, this.forceSettings.linkDistance);
	}

}

function getForceAtlasSettings(
	graph: RuntimeGraph,
	spacing: number,
	forceSettings: GraphForceSettings,
) {
	const distanceScale = Math.max(forceSettings.linkDistance, 1) / 250;
	return {
		...forceAtlas2.inferSettings(graph),
		barnesHutOptimize: graph.order > 80,
		barnesHutTheta: graph.order > 500 ? 0.8 : 0.5,
		gravity: Math.max(forceSettings.centerForce, 0),
		scalingRatio:
			0.8 * Math.max(forceSettings.repelForce, 0.1) *
			spacing *
			spacing *
			distanceScale *
			distanceScale,
		edgeWeightInfluence: Math.min(Math.max(forceSettings.linkForce, 0) * 1.5, 5),
		slowDown: 2.5,
	};
}

function normalizeLinkDistance(
	graph: RuntimeGraph,
	spacing: number,
	linkDistance: number,
): void {
	const targetDistance = (Math.max(linkDistance, 1) / 100) * spacing;
	const currentDistance = readMedianEdgeDistance(graph);
	if (!currentDistance || !Number.isFinite(currentDistance)) {
		return;
	}
	const scale = targetDistance / currentDistance;
	if (!Number.isFinite(scale) || scale <= 0) {
		return;
	}
	const center = getGraphCenter(graph);
	graph.forEachNode((node, attributes) => {
		if (attributes.isBend) {
			return;
		}
		graph.mergeNodeAttributes(node, {
			x: center.x + (attributes.x - center.x) * scale,
			y: center.y + (attributes.y - center.y) * scale,
		});
	});
}

function readMedianEdgeDistance(graph: RuntimeGraph): number | undefined {
	const distances = graph
		.edges()
		.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden'))
		.map((edge) => {
			const source = graph.getNodeAttributes(graph.source(edge));
			const target = graph.getNodeAttributes(graph.target(edge));
			const distance = Math.hypot(target.x - source.x, target.y - source.y);
			return Number.isFinite(distance) && distance > 0 ? distance : undefined;
		})
		.filter((distance): distance is number => distance !== undefined)
		.sort((left, right) => left - right);
	if (distances.length === 0) {
		return undefined;
	}
	const middle = Math.floor(distances.length / 2);
	return distances.length % 2 === 0
		? ((distances[middle - 1] ?? 0) + (distances[middle] ?? 0)) / 2
		: distances[middle];
}

function getGraphCenter(graph: RuntimeGraph): { x: number; y: number } {
	let x = 0;
	let y = 0;
	let count = 0;
	graph.forEachNode((_, attributes) => {
		if (attributes.isBend) {
			return;
		}
		x += attributes.x;
		y += attributes.y;
		count += 1;
	});
	return count > 0 ? { x: x / count, y: y / count } : { x: 0, y: 0 };
}
