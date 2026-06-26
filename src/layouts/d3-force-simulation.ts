import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from 'd3-force';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { SigmaRenderer } from '../graph/sigma-renderer';

interface ForceNode extends SimulationNodeDatum {
	id: string;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
	source: string | ForceNode;
	target: string | ForceNode;
}

export class D3ForceSimulation {
	private simulation?: Simulation<ForceNode, ForceLink>;
	private nodes: ForceNode[] = [];
	private readonly nodesById = new Map<string, ForceNode>();
	private settleTimer?: number;

	constructor(
		private readonly graph: RuntimeGraph,
		private readonly renderer: SigmaRenderer,
		private readonly spacing = 1,
		private readonly onPosition?: (nodeId: string, position: { x: number; y: number }) => void,
	) {
		this.rebuild();
	}

	start(): void {
		this.ensureSimulation();
		window.clearTimeout(this.settleTimer);
		this.renderer.holdCurrentBounds();
		const simulation = this.simulation;
		if (!simulation) {
			return;
		}
		simulation.alpha(Math.max(simulation.alpha(), 0.06)).alphaTarget(0).restart();
	}

	drag(nodeId: string, position: { x: number; y: number }): void {
		this.ensureSimulation();
		const node = this.nodesById.get(nodeId);
		if (!node) {
			return;
		}
		node.fx = position.x;
		node.fy = position.y;
		node.x = position.x;
		node.y = position.y;
		this.graph.mergeNodeAttributes(nodeId, {
			x: position.x,
			y: position.y,
			fixed: true,
		});
		this.onPosition?.(nodeId, position);
		this.start();
	}

	release(nodeId: string): void {
		this.ensureSimulation();
		const node = this.nodesById.get(nodeId);
		if (node) {
			node.fx = null;
			node.fy = null;
		}
		if (this.graph.hasNode(nodeId)) {
			this.graph.setNodeAttribute(nodeId, 'fixed', false);
		}
		this.simulation?.alphaTarget(0).restart();
		this.scheduleStop();
	}

	stop(): void {
		window.clearTimeout(this.settleTimer);
		this.settleTimer = undefined;
		this.simulation?.stop();
		this.simulation = undefined;
	}

	private ensureSimulation(): void {
		if (!this.simulation) {
			this.rebuild();
		}
	}

	private rebuild(): void {
		this.nodes = this.graph
			.nodes()
			.filter((nodeId) => !this.graph.getNodeAttribute(nodeId, 'isBend'))
			.map((nodeId) => {
				const attributes = this.graph.getNodeAttributes(nodeId);
				return {
					id: nodeId,
					x: attributes.x,
					y: attributes.y,
				};
			});
		this.nodesById.clear();
		for (const node of this.nodes) {
			this.nodesById.set(node.id, node);
		}
		const links = this.graph
			.edges()
			.filter((edgeId) => !this.graph.getEdgeAttribute(edgeId, 'hidden'))
			.map((edgeId) => ({
				source: this.graph.source(edgeId),
				target: this.graph.target(edgeId),
			}))
			.filter(
				(link) =>
					this.nodesById.has(link.source) && this.nodesById.has(link.target),
			);

		const center = getGraphCenter(this.nodes);
		const distance = estimateLinkDistance(this.graph, links, this.nodesById) *
			this.spacing;
		this.simulation = forceSimulation<ForceNode, ForceLink>(this.nodes)
			.force(
				'link',
				forceLink<ForceNode, ForceLink>(links)
					.id((node) => node.id)
					.distance(distance)
					.strength(0.08),
			)
			.force('charge', forceManyBody().strength(-distance * 0.025))
			.force(
				'collide',
				forceCollide<ForceNode>()
					.radius(Math.max(distance * 0.04, 0.01))
					.strength(0.18),
			)
			.force('x', forceX(center.x).strength(0.02))
			.force('y', forceY(center.y).strength(0.02))
			.force('center', forceCenter(center.x, center.y).strength(0.01))
			.alphaDecay(0.09)
			.velocityDecay(0.78)
			.stop()
			.on('tick', () => this.applyTick());
	}

	private applyTick(): void {
		for (const node of this.nodes) {
			const x = node.x;
			const y = node.y;
			if (
				typeof x !== 'number' ||
				typeof y !== 'number' ||
				!Number.isFinite(x) ||
				!Number.isFinite(y)
			) {
				continue;
			}
			this.graph.mergeNodeAttributes(node.id, {
				x,
				y,
			});
			this.onPosition?.(node.id, { x, y });
		}
		this.renderer.instance.refresh();
	}

	private scheduleStop(): void {
		window.clearTimeout(this.settleTimer);
		this.settleTimer = window.setTimeout(() => this.stop(), 1600);
	}
}

function estimateLinkDistance(
	graph: RuntimeGraph,
	links: Array<{ source: string; target: string }>,
	nodesById: ReadonlyMap<string, ForceNode>,
): number {
	const lengths = links
		.map((link) => {
			const source = nodesById.get(link.source);
			const target = nodesById.get(link.target);
			if (!source || !target) {
				return undefined;
			}
			const sx = source.x;
			const sy = source.y;
			const tx = target.x;
			const ty = target.y;
			if (
				typeof sx !== 'number' ||
				typeof sy !== 'number' ||
				typeof tx !== 'number' ||
				typeof ty !== 'number'
			) {
				return undefined;
			}
			return Math.hypot(tx - sx, ty - sy);
		})
		.filter(
			(length): length is number =>
				typeof length === 'number' &&
				Number.isFinite(length) &&
				length > 0,
		)
		.sort((a, b) => a - b);
	if (lengths.length > 0) {
		return clamp(readMedian(lengths), 0.05, 500);
	}
	const graphSize = Math.max(graph.order, 1);
	return clamp(1 / Math.sqrt(graphSize), 0.05, 2);
}

function getGraphCenter(nodes: ForceNode[]): { x: number; y: number } {
	let x = 0;
	let y = 0;
	let count = 0;
	for (const node of nodes) {
		if (typeof node.x === 'number' && typeof node.y === 'number') {
			x += node.x;
			y += node.y;
			count += 1;
		}
	}
	return count > 0 ? { x: x / count, y: y / count } : { x: 0, y: 0 };
}

function readMedian(values: number[]): number {
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0
		? ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
		: (values[middle] ?? 0);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
