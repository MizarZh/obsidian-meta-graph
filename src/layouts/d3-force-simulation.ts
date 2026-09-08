import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Force,
	type Simulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum,
} from 'd3-force';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type { ForceSimulationRenderer } from '@/graph/renderers/renderer-contracts';
import {
	DEFAULT_GRAPH_FORCE_SETTINGS,
	type GraphForceSettings,
} from '@/layouts/force-layout';
import {
	collectGraphGroupMembers,
	createGraphGroupLinks,
	getGraphGroupTargetRadius,
} from '@/layouts/graph-group-layout';

interface ForceNode extends SimulationNodeDatum {
	id: string;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
	source: string | ForceNode;
	target: string | ForceNode;
	isGroup?: boolean;
}

const COOLING_DELAY_MS = 12000;
const STABLE_FRAME_LIMIT = 8;
const ALPHA_STOP_THRESHOLD = 0.0015;

export class D3ForceSimulation {
	private simulation?: Simulation<ForceNode, ForceLink>;
	private nodes: ForceNode[] = [];
	private readonly nodesById = new Map<string, ForceNode>();
	private readonly neighborsById = new Map<string, Set<string>>();
	private draggedNodePosition?: { nodeId: string; x: number; y: number };
	private draggedNodeViewportTarget?: {
		nodeId: string;
		x: number;
		y: number;
	};
	private settleTimer?: number;
	private stableFrameCount = 0;
	private forceMotionActive = false;

	constructor(
		private readonly graph: RuntimeGraph,
		private readonly renderer: ForceSimulationRenderer,
		private readonly spacing = 1,
		private readonly forceSettings: GraphForceSettings = DEFAULT_GRAPH_FORCE_SETTINGS,
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
		private readonly onPosition?: (
			nodeId: string,
			position: { x: number; y: number },
		) => void,
		private readonly timerWindow?: Pick<
			Window,
			'setTimeout' | 'clearTimeout'
		>,
	) {
		this.rebuild();
	}

	start(): void {
		this.ensureSimulation();
		(this.timerWindow ?? window).clearTimeout(this.settleTimer);
		const simulation = this.simulation;
		if (!simulation) {
			return;
		}
		simulation
			.alpha(Math.max(simulation.alpha(), 0.12))
			.alphaTarget(this.draggedNodePosition ? 0.12 : 0)
			.restart();
		this.stableFrameCount = 0;
		if (!this.forceMotionActive) {
			this.forceMotionActive = true;
			this.renderer.beginForceMotion();
		}
		this.scheduleStop();
	}

	drag(
		nodeId: string,
		position: { x: number; y: number },
		viewportPosition?: { x: number; y: number },
	): void {
		this.ensureSimulation();
		const node = this.nodesById.get(nodeId);
		if (!node) {
			return;
		}
		this.draggedNodePosition = { nodeId, x: position.x, y: position.y };
		this.draggedNodeViewportTarget = viewportPosition
			? { nodeId, x: viewportPosition.x, y: viewportPosition.y }
			: undefined;
		node.fx = position.x;
		node.fy = position.y;
		node.x = position.x;
		node.y = position.y;
		node.vx = 0;
		node.vy = 0;
		this.start();
		// Publish immediately; pointer tracking must not wait for a physics tick.
		this.applyTick();
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
		if (this.draggedNodeViewportTarget?.nodeId === nodeId) {
			this.draggedNodeViewportTarget = undefined;
		}
		this.simulation?.alphaTarget(0).restart();
		this.scheduleStop();
	}

	stop(): void {
		(this.timerWindow ?? window).clearTimeout(this.settleTimer);
		this.settleTimer = undefined;
		this.simulation?.stop();
		this.simulation = undefined;
		if (
			this.draggedNodePosition &&
			this.graph.hasNode(this.draggedNodePosition.nodeId)
		) {
			this.graph.setNodeAttribute(
				this.draggedNodePosition.nodeId,
				'fixed',
				false,
			);
		}
		this.draggedNodePosition = undefined;
		this.draggedNodeViewportTarget = undefined;
		this.stableFrameCount = 0;
		if (this.forceMotionActive) {
			this.forceMotionActive = false;
			this.renderer.endForceMotion();
		}
		this.renderer.clearHeldBounds();
	}

	private ensureSimulation(): void {
		if (!this.simulation) {
			this.rebuild();
		}
	}

	private rebuild(): void {
		this.nodes = this.graph
			.nodes()
			.filter(
				(nodeId) =>
					!this.graph.getNodeAttribute(nodeId, 'isBend') &&
					!this.graph.getNodeAttribute(nodeId, 'hidden'),
			)
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
		for (const node of this.nodes) {
			this.nodesById.set(node.id, node);
		}
		const seenLinkKeys = new Set<string>();
		const graphLinks = this.graph
			.edges()
			.filter((edgeId) => !this.graph.getEdgeAttribute(edgeId, 'hidden'))
			.map((edgeId) => {
				const attributes = this.graph.getEdgeAttributes(edgeId);
				const source =
					attributes.logicalSource ?? this.graph.source(edgeId);
				const target =
					attributes.logicalTarget ?? this.graph.target(edgeId);
				const parallelKey =
					(attributes.parallelCount ?? 1) > 1
						? attributes.parallelGroupKey
						: undefined;
				const key = attributes.logicalEdgeId ?? parallelKey ?? edgeId;
				if (seenLinkKeys.has(key)) {
					return undefined;
				}
				seenLinkKeys.add(key);
				return { source, target };
			})
			.filter((link): link is { source: string; target: string } => {
				if (!link) {
					return false;
				}
				return (
					this.nodesById.has(link.source) &&
					this.nodesById.has(link.target)
				);
			});
		for (const link of graphLinks) {
			addNeighbor(this.neighborsById, link.source, link.target);
			addNeighbor(this.neighborsById, link.target, link.source);
		}
		const links: ForceLink[] = [
			...graphLinks,
			...createGraphGroupLinks(
				this.groupByNode,
				this.nodesById.keys(),
			).map((link) => ({
				source: link.source,
				target: link.target,
				isGroup: true,
			})),
		];

		const center = getGraphCenter(this.nodes);
		const distance =
			Math.max(this.forceSettings.linkDistance / 100, 0.1) * this.spacing;
		const centerStrength = this.forceSettings.centerForce * 0.006;
		const linkStrength = Math.min(this.forceSettings.linkForce * 0.25, 1);
		const repelStrength =
			-this.forceSettings.repelForce * distance * distance * 0.012;
		const repelMinDistance = distance * 0.25;
		const repelMaxDistance = distance * 6;
		this.simulation = forceSimulation<ForceNode, ForceLink>(this.nodes)
			.force(
				'link',
				forceLink<ForceNode, ForceLink>(links)
					.id((node) => node.id)
					.distance((link) =>
						link.isGroup ? distance * 0.65 : distance,
					)
					.strength((link) =>
						link.isGroup
							? Math.max(linkStrength, 0.35)
							: linkStrength /
								Math.sqrt(
									Math.max(
										1,
										Math.min(
											this.neighborsById.get(
												typeof link.source === 'string'
													? link.source
													: link.source.id,
											)?.size ?? 1,
											this.neighborsById.get(
												typeof link.target === 'string'
													? link.target
													: link.target.id,
											)?.size ?? 1,
										),
									),
								),
					),
			)
			.force(
				'charge',
				forceManyBody()
					.strength(repelStrength)
					.distanceMin(repelMinDistance)
					.distanceMax(repelMaxDistance),
			)
			.force(
				'collide',
				forceCollide<ForceNode>()
					.radius(Math.max(distance * 0.08, 0.01))
					.strength(0.7)
					.iterations(2),
			)
			.force('x', forceX(center.x).strength(centerStrength))
			.force('y', forceY(center.y).strength(centerStrength * 2))
			.force(
				'group',
				createGraphGroupCohesionForce(this.groupByNode, distance),
			)
			.force('speed-limit', () => {
				// Bound free-node motion in graph units, independent of graph size.
				for (const node of this.nodes) {
					const speed = Math.hypot(node.vx ?? 0, node.vy ?? 0);
					if (speed <= distance * 0.12) continue;
					const ratio = (distance * 0.12) / speed;
					node.vx = (node.vx ?? 0) * ratio;
					node.vy = (node.vy ?? 0) * ratio;
				}
			})
			.alphaDecay(0.025)
			.alphaMin(ALPHA_STOP_THRESHOLD)
			.velocityDecay(0.45)
			.stop()
			.alpha(0)
			.on('tick', () => this.applyTick())
			.on('end', () => this.finishSettling());
	}

	private applyTick(): void {
		this.syncDraggedNodeToViewportTarget();
		const positions = new Map<string, { x: number; y: number }>();
		let maxDisplacement = 0;
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
			positions.set(node.id, { x, y });
			if (this.graph.hasNode(node.id)) {
				const attributes = this.graph.getNodeAttributes(node.id);
				maxDisplacement = Math.max(
					maxDisplacement,
					Math.hypot(x - attributes.x, y - attributes.y),
				);
			}
			this.onPosition?.(node.id, { x, y });
		}
		this.graph.updateEachNodeAttributes(
			(nodeId, attributes) => {
				const position = positions.get(nodeId);
				if (!position) return attributes;
				return {
					...attributes,
					...position,
					...(nodeId === this.draggedNodePosition?.nodeId
						? { fixed: true }
						: {}),
				};
			},
			{ attributes: ['x', 'y', 'fixed'] },
		);
		this.renderer.syncForcePositions?.();
		this.updateSettledState(maxDisplacement);
	}

	private syncDraggedNodeToViewportTarget(): void {
		const target = this.draggedNodeViewportTarget;
		if (!target) {
			return;
		}
		const node = this.nodesById.get(target.nodeId);
		if (!node) {
			this.draggedNodeViewportTarget = undefined;
			return;
		}
		const position = this.renderer.viewportToGraphPosition(target);
		node.fx = position.x;
		node.fy = position.y;
		node.x = position.x;
		node.y = position.y;
	}

	private scheduleStop(): void {
		(this.timerWindow ?? window).clearTimeout(this.settleTimer);
		if (this.draggedNodePosition) return;
		this.settleTimer = (this.timerWindow ?? window).setTimeout(() => {
			// Cool a long-running simulation smoothly; never stop a held node.
			if (this.draggedNodePosition) return;
			this.simulation
				?.alphaTarget(0)
				.alpha(Math.min(this.simulation.alpha(), 0.02));
		}, COOLING_DELAY_MS);
	}

	private updateSettledState(maxDisplacement: number): void {
		if (!this.forceMotionActive) return;
		if (this.draggedNodePosition) {
			this.stableFrameCount = 0;
			return;
		}
		const displacementThreshold = Math.max(this.spacing * 0.0025, 0.0001);
		this.stableFrameCount =
			maxDisplacement <= displacementThreshold
				? this.stableFrameCount + 1
				: 0;
		if (
			(this.simulation?.alpha() ?? 0) <= ALPHA_STOP_THRESHOLD ||
			this.stableFrameCount >= STABLE_FRAME_LIMIT
		) {
			this.finishSettling();
		}
	}

	private finishSettling(): void {
		if (!this.simulation && !this.forceMotionActive) return;
		this.stop();
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

function createGraphGroupCohesionForce(
	groupByNode: ReadonlyMap<string, string>,
	distance: number,
): Force<ForceNode, ForceLink> {
	let groups: ForceNode[][] = [];
	const force = ((alpha: number): void => {
		const strength = Math.min(alpha * 1.6, 0.45);
		if (strength <= 0) {
			return;
		}
		for (const members of groups) {
			if (members.length < 2) {
				continue;
			}
			const center = {
				x:
					members.reduce((sum, node) => sum + (node.x ?? 0), 0) /
					members.length,
				y:
					members.reduce((sum, node) => sum + (node.y ?? 0), 0) /
					members.length,
			};
			const targetRadius = getGraphGroupTargetRadius(
				members.length,
				distance,
			);
			for (const node of members) {
				const dx = center.x - (node.x ?? 0);
				const dy = center.y - (node.y ?? 0);
				const radius = Math.hypot(dx, dy);
				if (radius <= targetRadius || radius === 0) {
					continue;
				}
				const excess = (radius - targetRadius) / radius;
				node.vx = (node.vx ?? 0) + dx * excess * strength;
				node.vy = (node.vy ?? 0) + dy * excess * strength;
			}
		}
	}) as Force<ForceNode, ForceLink>;
	force.initialize = (nodes): void => {
		const nodesById = new Map(nodes.map((node) => [node.id, node]));
		groups = [
			...collectGraphGroupMembers(groupByNode, nodesById.keys()).values(),
		]
			.map((nodeIds) =>
				nodeIds.flatMap((nodeId) => {
					const node = nodesById.get(nodeId);
					return node ? [node] : [];
				}),
			)
			.filter((members) => members.length > 1);
	};
	return force;
}
