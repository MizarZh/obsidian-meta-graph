import type { RuntimeGraph } from './graphology-adapter';

/**
 * Assigns deterministic lanes to edges that connect the same pair of nodes.
 *
 * Lanes are calculated from the canonical (lexicographically ordered) pair,
 * so opposite directed edges and undirected edges share one visual corridor
 * without accidentally being put on top of each other.
 */
export function assignParallelEdgeLanes(graph: RuntimeGraph): void {
	const groups = new Map<string, ParallelEdgeRecord[]>();

	graph.forEachEdge((edgeId, attributes, source, target) => {
		const [canonicalSource, canonicalTarget] = canonicalPair(
			source,
			target,
		);
		const groupKey = `${canonicalSource}\u0000${canonicalTarget}`;
		const group = groups.get(groupKey) ?? [];
		group.push({
			id: edgeId,
			relation: attributes.relation,
			directed: graph.isDirected(edgeId),
			source,
			target,
		});
		groups.set(groupKey, group);
	});

	for (const [groupKey, group] of groups) {
		const [canonicalSource] = groupKey.split('\u0000');
		group.sort(compareParallelEdges);
		const laneCenter = (group.length - 1) / 2;
		for (const [index, edge] of group.entries()) {
			graph.mergeEdgeAttributes(edge.id, {
				parallelGroupKey: groupKey,
				parallelLane: index - laneCenter,
				parallelCount: group.length,
				parallelDirection: edge.source === canonicalSource ? 1 : -1,
			});
		}
	}
}

export interface ParallelEdgeRouteAttributes {
	parallelLane?: number;
	parallelCount?: number;
	parallelDirection?: 1 | -1;
}

/**
 * Pixel distance between adjacent visual lanes.
 *
 * The renderer deliberately keeps this independent from graph coordinates:
 * zooming or a large node should never turn two parallel links into a huge
 * detour. The small clamp also keeps labels and arrows in the same compact
 * corridor as the line program.
 */
export function getParallelLaneStep(edgeSize = 1): number {
	const size = Number.isFinite(edgeSize) && edgeSize > 0 ? edgeSize : 1;
	// Sigma keeps a 1.7px minimum edge half-width. Mirror that floor here so
	// labels use the same lane center as the WebGL line/arrow programs.
	return Math.max(3, Math.min(8, Math.max(size, 1.7) * 2.5));
}

export function getParallelLaneOffset(
	attributes: ParallelEdgeRouteAttributes,
	edgeSize = 1,
): number {
	return getCanonicalParallelLane(attributes) * getParallelLaneStep(edgeSize);
}

export function getParallelLane(
	attributes: ParallelEdgeRouteAttributes,
): number {
	if ((attributes.parallelCount ?? 1) <= 1) {
		return 0;
	}
	return attributes.parallelLane ?? 0;
}

export function getCanonicalParallelLane(
	attributes: ParallelEdgeRouteAttributes,
): number {
	return getParallelLane(attributes) * (attributes.parallelDirection ?? 1);
}

function canonicalPair(source: string, target: string): [string, string] {
	return source <= target ? [source, target] : [target, source];
}

interface ParallelEdgeRecord {
	id: string;
	relation: string;
	directed: boolean;
	source: string;
	target: string;
}

function compareParallelEdges(
	left: ParallelEdgeRecord,
	right: ParallelEdgeRecord,
): number {
	return (
		left.relation.localeCompare(right.relation, undefined, {
			sensitivity: 'base',
		}) ||
		Number(left.directed) - Number(right.directed) ||
		left.source.localeCompare(right.source, undefined, {
			sensitivity: 'base',
		}) ||
		left.target.localeCompare(right.target, undefined, {
			sensitivity: 'base',
		}) ||
		left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
	);
}
