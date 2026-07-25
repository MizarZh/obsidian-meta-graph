import forceAtlas2 from 'graphology-layout-forceatlas2';
import ForceAtlas2LayoutSupervisor from 'graphology-layout-forceatlas2/worker';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
} from '../graph/model/graphology-adapter';
import {
	compactGraphGroups,
	createGraphGroupLinks,
} from './graph-group-layout';
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
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
		private readonly useWorker = false,
		private readonly isStale: () => boolean = () => false,
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		graph.forEachNode((node, attributes) => {
			graph.setNodeAttribute(node, 'fixed', false);
			if (
				!Number.isFinite(attributes.x) ||
				!Number.isFinite(attributes.y)
			) {
				graph.mergeNodeAttributes(node, {
					x: 0,
					y: 0,
				});
			}
		});
		graph.forEachEdge((edge) =>
			graph.setEdgeAttribute(edge, 'hidden', false),
		);

		if (graph.order < 2) {
			return;
		}

		const layoutGraph = createForceAtlasGroupGraph(graph, this.groupByNode);
		const iterations = graph.order < 50 ? 150 : 250;
		const settings = getForceAtlasSettings(
			layoutGraph,
			this.spacing,
			this.forceSettings,
		);
		if (
			this.useWorker &&
			layoutGraph.order >= 200 &&
			typeof Worker !== 'undefined' &&
			typeof Blob !== 'undefined'
		) {
			try {
				await assignForceAtlasInWorker(
					layoutGraph,
					iterations,
					settings,
					this.isStale,
				);
			} catch {
				if (this.isStale()) return;
				forceAtlas2.assign(layoutGraph, { iterations, settings });
			}
		} else {
			forceAtlas2.assign(layoutGraph, { iterations, settings });
		}
		if (this.isStale()) return;
		if (layoutGraph !== graph) {
			graph.forEachNode((nodeId) => {
				graph.mergeNodeAttributes(nodeId, {
					x: layoutGraph.getNodeAttribute(nodeId, 'x'),
					y: layoutGraph.getNodeAttribute(nodeId, 'y'),
				});
			});
		}
		normalizeLinkDistance(
			graph,
			this.spacing,
			this.forceSettings.linkDistance,
		);
		compactGraphGroups(
			graph,
			this.groupByNode,
			this.spacing,
			this.forceSettings.linkDistance,
		);
	}
}

async function assignForceAtlasInWorker(
	graph: RuntimeGraph,
	iterations: number,
	settings: ReturnType<typeof getForceAtlasSettings>,
	isStale: () => boolean,
): Promise<void> {
	const supervisor = new ForceAtlas2LayoutSupervisor(graph, { settings });
	const worker = (
		supervisor as unknown as {
			worker: Worker;
		}
	).worker;
	await new Promise<void>((resolve, reject) => {
		let completedIterations = 0;
		const cleanup = (): void => {
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
			supervisor.kill();
		};
		const handleMessage = (): void => {
			completedIterations += 1;
			if (!isStale() && completedIterations < iterations) return;
			cleanup();
			resolve();
		};
		const handleError = (event: ErrorEvent): void => {
			cleanup();
			reject(
				event.error instanceof Error
					? event.error
					: new Error(event.message),
			);
		};
		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);
		supervisor.start();
	});
}

function createForceAtlasGroupGraph(
	graph: RuntimeGraph,
	groupByNode: ReadonlyMap<string, string>,
): RuntimeGraph {
	const groupLinks = createGraphGroupLinks(
		groupByNode,
		graph
			.nodes()
			.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend')),
	);
	if (groupLinks.length === 0) {
		return graph;
	}
	const layoutGraph = graph.copy();
	for (const [index, link] of groupLinks.entries()) {
		const attributes: RuntimeEdgeAttributes & { weight: number } = {
			relation: 'related',
			type: 'line',
			size: 0,
			color: '',
			hidden: true,
			label: '',
			forceLabel: false,
			lineStyle: 'solid',
			semantic: false,
			weight: 2,
		};
		layoutGraph.addUndirectedEdgeWithKey(
			createUniqueGroupEdgeId(layoutGraph, index),
			link.source,
			link.target,
			attributes,
		);
	}
	return layoutGraph;
}

function createUniqueGroupEdgeId(graph: RuntimeGraph, index: number): string {
	const base = `__meta_graph_group_edge_${index + 1}__`;
	let edgeId = base;
	let suffix = 2;
	while (graph.hasEdge(edgeId)) {
		edgeId = `${base}_${suffix}`;
		suffix += 1;
	}
	return edgeId;
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
			0.8 *
			Math.max(forceSettings.repelForce, 0.1) *
			spacing *
			spacing *
			distanceScale *
			distanceScale,
		edgeWeightInfluence: Math.min(
			Math.max(forceSettings.linkForce, 0) * 1.5,
			5,
		),
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
			const distance = Math.hypot(
				target.x - source.x,
				target.y - source.y,
			);
			return Number.isFinite(distance) && distance > 0
				? distance
				: undefined;
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
