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
import {
	DEFAULT_GRAPH_FORCE_SETTINGS,
	type GraphForceSettings,
} from './force-layout';

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
	private readonly neighborsById = new Map<string, Set<string>>();
	private readonly returnTargetsById = new Map<
		string,
		{ x: number; y: number; expiresAt: number }
	>();
	private draggedNodePosition?: { nodeId: string; x: number; y: number };
	private settleTimer?: number;

	constructor(
		private readonly graph: RuntimeGraph,
		private readonly renderer: SigmaRenderer,
		private readonly spacing = 1,
		private readonly forceSettings: GraphForceSettings = DEFAULT_GRAPH_FORCE_SETTINGS,
		private readonly onPosition?: (
			nodeId: string,
			position: { x: number; y: number },
		) => void,
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
		simulation
			.alpha(Math.max(simulation.alpha(), 0.12))
			.alphaTarget(0)
			.restart();
	}

	drag(nodeId: string, position: { x: number; y: number }): void {
		this.ensureSimulation();
		const node = this.nodesById.get(nodeId);
		if (!node) {
			return;
		}
		const previous =
			this.draggedNodePosition?.nodeId === nodeId
				? this.draggedNodePosition
				: undefined;
		const delta = previous
			? { x: position.x - previous.x, y: position.y - previous.y }
			: { x: 0, y: 0 };
		this.draggedNodePosition = { nodeId, x: position.x, y: position.y };
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
		this.dragNeighbors(nodeId, delta);
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
		if (this.draggedNodePosition?.nodeId === nodeId) {
			this.draggedNodePosition = undefined;
		}
		this.setReturnTarget(nodeId);
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
		this.neighborsById.clear();
		this.returnTargetsById.clear();
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
					this.nodesById.has(link.source) &&
					this.nodesById.has(link.target),
			);
		for (const link of links) {
			addNeighbor(this.neighborsById, link.source, link.target);
			addNeighbor(this.neighborsById, link.target, link.source);
		}

		const center = getGraphCenter(this.nodes);
		const distance = (this.forceSettings.linkDistance / 100) * this.spacing;
		const centerStrength = this.forceSettings.centerForce * 0.03;
		const linkStrength = Math.min(this.forceSettings.linkForce * 0.25, 1);
		const repelStrength = -this.forceSettings.repelForce * distance * 10;
		this.simulation = forceSimulation<ForceNode, ForceLink>(this.nodes)
			.force(
				'link',
				forceLink<ForceNode, ForceLink>(links)
					.id((node) => node.id)
					.distance(distance)
					.strength(linkStrength),
			)
			.force('charge', forceManyBody().strength(repelStrength))
			.force(
				'collide',
				forceCollide<ForceNode>()
					.radius(Math.max(distance * 0.04, 0.01))
					.strength(0.18),
			)
			.force('x', forceX(center.x).strength(centerStrength * 2))
			.force('y', forceY(center.y).strength(centerStrength * 2))
			.force(
				'center',
				forceCenter(center.x, center.y).strength(centerStrength),
			)
			.alphaDecay(0.045)
			.velocityDecay(0.78)
			.stop()
			.on('tick', () => this.applyTick());
	}

	private dragNeighbors(
		nodeId: string,
		delta: { x: number; y: number },
	): void {
		if (delta.x === 0 && delta.y === 0) {
			return;
		}
		const influence = Math.min(this.forceSettings.dragLinkForce * 0.18, 0.85);
		if (influence <= 0) {
			return;
		}
		for (const neighborId of this.neighborsById.get(nodeId) ?? []) {
			const neighbor = this.nodesById.get(neighborId);
			if (!neighbor || neighbor.fx !== undefined || neighbor.fy !== undefined) {
				continue;
			}
			const x = (neighbor.x ?? 0) + delta.x * influence;
			const y = (neighbor.y ?? 0) + delta.y * influence;
			neighbor.x = x;
			neighbor.y = y;
			this.graph.mergeNodeAttributes(neighborId, { x, y });
			this.onPosition?.(neighborId, { x, y });
		}
	}

	private applyTick(): void {
		this.applyReturnForces();
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

	private setReturnTarget(nodeId: string): void {
		const neighbors = [...(this.neighborsById.get(nodeId) ?? [])]
			.map((neighborId) => this.nodesById.get(neighborId))
			.filter((neighbor): neighbor is ForceNode =>
				Boolean(
					neighbor &&
						typeof neighbor.x === 'number' &&
						typeof neighbor.y === 'number',
				),
			);
		if (neighbors.length === 0 || this.forceSettings.returnForce <= 0) {
			this.returnTargetsById.delete(nodeId);
			return;
		}
		const target = {
			x:
				neighbors.reduce((sum, neighbor) => sum + (neighbor.x ?? 0), 0) /
				neighbors.length,
			y:
				neighbors.reduce((sum, neighbor) => sum + (neighbor.y ?? 0), 0) /
				neighbors.length,
			expiresAt: performance.now() + 4000,
		};
		this.returnTargetsById.set(nodeId, target);
	}

	private applyReturnForces(): void {
		const now = performance.now();
		const returnDistance =
			(this.forceSettings.linkDistance / 100) * this.spacing * 1.5;
		const strength = Math.min(this.forceSettings.returnForce * 0.02, 0.2);
		if (strength <= 0) {
			return;
		}
		for (const [nodeId, target] of this.returnTargetsById.entries()) {
			const node = this.nodesById.get(nodeId);
			if (!node || target.expiresAt < now) {
				this.returnTargetsById.delete(nodeId);
				continue;
			}
			const dx = target.x - (node.x ?? 0);
			const dy = target.y - (node.y ?? 0);
			const distance = Math.hypot(dx, dy);
			if (distance <= returnDistance) {
				this.returnTargetsById.delete(nodeId);
				continue;
			}
			const excessRatio = (distance - returnDistance) / distance;
			node.vx = (node.vx ?? 0) + dx * excessRatio * strength;
			node.vy = (node.vy ?? 0) + dy * excessRatio * strength;
		}
	}

	private scheduleStop(): void {
		window.clearTimeout(this.settleTimer);
		this.settleTimer = window.setTimeout(() => this.stop(), 4000);
	}
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

function addNeighbor(
	neighborsById: Map<string, Set<string>>,
	source: string,
	target: string,
): void {
	let neighbors = neighborsById.get(source);
	if (!neighbors) {
		neighbors = new Set();
		neighborsById.set(source, neighbors);
	}
	neighbors.add(target);
}
