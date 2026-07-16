import type { ChartGroupDefinition } from '../core/types';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import type {
	GraphGroupGeometry,
	GroupMemberHaloGeometry,
} from './group-geometry';

export interface GraphGroupLink {
	groupId: string;
	source: string;
	target: string;
}

interface GraphGroupCluster {
	groupId: string;
	nodeIds: string[];
	x: number;
	y: number;
	radius: number;
}

export function createGraphGroupLinks(
	groupByNode: ReadonlyMap<string, string>,
	availableNodeIds: Iterable<string>,
): GraphGroupLink[] {
	const membersByGroup = collectGraphGroupMembers(
		groupByNode,
		availableNodeIds,
	);
	const links: GraphGroupLink[] = [];
	for (const [groupId, members] of membersByGroup) {
		if (members.length < 2) {
			continue;
		}
		if (members.length === 2) {
			links.push({ groupId, source: members[0]!, target: members[1]! });
			continue;
		}
		for (const [index, source] of members.entries()) {
			addGraphGroupLink(
				links,
				groupId,
				source,
				members[(index + 1) % members.length]!,
			);
		}
		if (members.length >= 4) {
			const offset = Math.floor(members.length / 2);
			for (const [index, source] of members.entries()) {
				addGraphGroupLink(
					links,
					groupId,
					source,
					members[(index + offset) % members.length]!,
				);
			}
		}
	}
	return links;
}

export function compactGraphGroups(
	graph: RuntimeGraph,
	groupByNode: ReadonlyMap<string, string>,
	spacing: number,
	linkDistance: number,
): void {
	const availableNodeIds = graph.nodes().filter((nodeId) => {
		const attributes = graph.getNodeAttributes(nodeId);
		return !attributes.isBend && !attributes.hidden;
	});
	const membersByGroup = collectGraphGroupMembers(
		groupByNode,
		availableNodeIds,
	);
	const distance = Math.max((linkDistance / 100) * spacing, 0.1);
	for (const members of membersByGroup.values()) {
		compactGraphGroup(graph, members, distance);
	}
	separateGraphGroupClusters(graph, membersByGroup, distance);
	pushUngroupedNodesOutsideClusters(
		graph,
		membersByGroup,
		availableNodeIds,
		distance,
	);
}

export function getGraphGroupTargetRadius(
	memberCount: number,
	distance: number,
): number {
	return Math.max(distance * 0.5, (distance * Math.sqrt(memberCount)) / 2.8);
}

export function createGraphGroupGeometries(
	graph: RuntimeGraph,
	groups: readonly ChartGroupDefinition[],
	groupByNode: ReadonlyMap<string, string>,
): GraphGroupGeometry[] {
	const visibleNodeIds = graph.nodes().filter((nodeId) => {
		const attributes = graph.getNodeAttributes(nodeId);
		return !attributes.isBend && !attributes.hidden;
	});
	const membersByGroup = collectGraphGroupMembers(
		groupByNode,
		visibleNodeIds,
	);
	return groups.flatMap((group) => {
		const nodeIds = membersByGroup.get(group.id);
		return nodeIds?.length
			? [
					{
						kind: 'graph-container' as const,
						groupId: group.id,
						name: group.name,
						color: group.color,
						padding: group.padding,
						nodeIds,
					},
				]
			: [];
	});
}

export function createGroupMemberHaloGeometries(
	graph: RuntimeGraph,
	groups: readonly ChartGroupDefinition[],
	groupByNode: ReadonlyMap<string, string>,
): GroupMemberHaloGeometry[] {
	const visibleNodeIds = graph.nodes().filter((nodeId) => {
		const attributes = graph.getNodeAttributes(nodeId);
		return !attributes.isBend && !attributes.hidden;
	});
	const membersByGroup = collectGraphGroupMembers(
		groupByNode,
		visibleNodeIds,
	);
	return groups.flatMap((group) => {
		const nodeIds = membersByGroup.get(group.id);
		return nodeIds?.length
			? [
					{
						kind: 'member-halos' as const,
						groupId: group.id,
						name: group.name,
						color: group.color,
						nodeIds,
					},
				]
			: [];
	});
}

export function collectGraphGroupMembers(
	groupByNode: ReadonlyMap<string, string>,
	availableNodeIds: Iterable<string>,
): Map<string, string[]> {
	const available = new Set(availableNodeIds);
	const membersByGroup = new Map<string, string[]>();
	for (const [nodeId, groupId] of groupByNode) {
		if (!available.has(nodeId)) {
			continue;
		}
		const members = membersByGroup.get(groupId) ?? [];
		members.push(nodeId);
		membersByGroup.set(groupId, members);
	}
	for (const members of membersByGroup.values()) {
		members.sort((left, right) => left.localeCompare(right));
	}
	return membersByGroup;
}

function addGraphGroupLink(
	links: GraphGroupLink[],
	groupId: string,
	source: string,
	target: string,
): void {
	if (
		source === target ||
		links.some(
			(link) =>
				link.groupId === groupId &&
				((link.source === source && link.target === target) ||
					(link.source === target && link.target === source)),
		)
	) {
		return;
	}
	links.push({ groupId, source, target });
}

function compactGraphGroup(
	graph: RuntimeGraph,
	nodeIds: string[],
	distance: number,
): void {
	if (nodeIds.length < 2) {
		return;
	}
	const center = readNodeCenter(graph, nodeIds);
	const radius = readNodeRadius(graph, nodeIds, center);
	const targetRadius = getGraphGroupTargetRadius(nodeIds.length, distance);
	if (!Number.isFinite(radius) || radius <= targetRadius || radius === 0) {
		return;
	}
	const scale = targetRadius / radius;
	for (const nodeId of nodeIds) {
		const attributes = graph.getNodeAttributes(nodeId);
		graph.mergeNodeAttributes(nodeId, {
			x: center.x + (attributes.x - center.x) * scale,
			y: center.y + (attributes.y - center.y) * scale,
		});
	}
}

function separateGraphGroupClusters(
	graph: RuntimeGraph,
	membersByGroup: ReadonlyMap<string, string[]>,
	distance: number,
): void {
	const groupIds = [...membersByGroup.keys()].sort((left, right) =>
		left.localeCompare(right),
	);
	for (let iteration = 0; iteration < 12; iteration += 1) {
		let moved = false;
		for (let leftIndex = 0; leftIndex < groupIds.length; leftIndex += 1) {
			for (
				let rightIndex = leftIndex + 1;
				rightIndex < groupIds.length;
				rightIndex += 1
			) {
				const leftId = groupIds[leftIndex]!;
				const rightId = groupIds[rightIndex]!;
				const left = readGraphGroupCluster(
					graph,
					leftId,
					membersByGroup.get(leftId) ?? [],
				);
				const right = readGraphGroupCluster(
					graph,
					rightId,
					membersByGroup.get(rightId) ?? [],
				);
				const minimumDistance =
					left.radius + right.radius + distance * 0.8;
				const delta = readSeparationDelta(left, right, minimumDistance);
				if (!delta) {
					continue;
				}
				translateNodes(graph, left.nodeIds, -delta.x / 2, -delta.y / 2);
				translateNodes(graph, right.nodeIds, delta.x / 2, delta.y / 2);
				moved = true;
			}
		}
		if (!moved) {
			break;
		}
	}
}

function pushUngroupedNodesOutsideClusters(
	graph: RuntimeGraph,
	membersByGroup: ReadonlyMap<string, string[]>,
	availableNodeIds: string[],
	distance: number,
): void {
	const groupedNodeIds = new Set(
		[...membersByGroup.values()].flatMap((members) => members),
	);
	const clusters = [...membersByGroup]
		.map(([groupId, members]) =>
			readGraphGroupCluster(graph, groupId, members),
		)
		.sort((left, right) => left.groupId.localeCompare(right.groupId));
	for (const nodeId of availableNodeIds.sort((left, right) =>
		left.localeCompare(right),
	)) {
		if (groupedNodeIds.has(nodeId)) {
			continue;
		}
		for (let iteration = 0; iteration < 8; iteration += 1) {
			const attributes = graph.getNodeAttributes(nodeId);
			const overlaps = clusters.filter(
				(cluster) =>
					Math.hypot(
						attributes.x - cluster.x,
						attributes.y - cluster.y,
					) <
					cluster.radius + distance * 0.5,
			);
			if (overlaps.length === 0) {
				break;
			}
			if (overlaps.length === 1) {
				pushNodeOutsideCluster(graph, nodeId, overlaps[0]!, distance);
				continue;
			}
			const center = {
				x:
					overlaps.reduce((sum, cluster) => sum + cluster.x, 0) /
					overlaps.length,
				y:
					overlaps.reduce((sum, cluster) => sum + cluster.y, 0) /
					overlaps.length,
			};
			const radius = Math.max(
				...overlaps.map(
					(cluster) =>
						Math.hypot(cluster.x - center.x, cluster.y - center.y) +
						cluster.radius +
						distance * 0.5,
				),
			);
			const direction = deterministicDirection(
				`${overlaps.map((cluster) => cluster.groupId).join(':')}:${nodeId}`,
			);
			graph.mergeNodeAttributes(nodeId, {
				x: center.x + direction.x * radius,
				y: center.y + direction.y * radius,
			});
		}
	}
}

function pushNodeOutsideCluster(
	graph: RuntimeGraph,
	nodeId: string,
	cluster: GraphGroupCluster,
	distance: number,
): void {
	const attributes = graph.getNodeAttributes(nodeId);
	const minimumDistance = cluster.radius + distance * 0.5;
	let dx = attributes.x - cluster.x;
	let dy = attributes.y - cluster.y;
	let currentDistance = Math.hypot(dx, dy);
	if (currentDistance < 0.0001) {
		const direction = deterministicDirection(
			`${cluster.groupId}:${nodeId}`,
		);
		dx = direction.x;
		dy = direction.y;
		currentDistance = 1;
	}
	const scale = minimumDistance / currentDistance;
	graph.mergeNodeAttributes(nodeId, {
		x: cluster.x + dx * scale,
		y: cluster.y + dy * scale,
	});
}

function readGraphGroupCluster(
	graph: RuntimeGraph,
	groupId: string,
	nodeIds: string[],
): GraphGroupCluster {
	const center = readNodeCenter(graph, nodeIds);
	return {
		groupId,
		nodeIds,
		...center,
		radius: readNodeRadius(graph, nodeIds, center),
	};
}

function readNodeCenter(
	graph: RuntimeGraph,
	nodeIds: string[],
): { x: number; y: number } {
	if (nodeIds.length === 0) {
		return { x: 0, y: 0 };
	}
	return {
		x:
			nodeIds.reduce(
				(sum, nodeId) => sum + graph.getNodeAttribute(nodeId, 'x'),
				0,
			) / nodeIds.length,
		y:
			nodeIds.reduce(
				(sum, nodeId) => sum + graph.getNodeAttribute(nodeId, 'y'),
				0,
			) / nodeIds.length,
	};
}

function readNodeRadius(
	graph: RuntimeGraph,
	nodeIds: string[],
	center: { x: number; y: number },
): number {
	return nodeIds.length === 0
		? 0
		: Math.max(
				...nodeIds.map((nodeId) => {
					const attributes = graph.getNodeAttributes(nodeId);
					return Math.hypot(
						attributes.x - center.x,
						attributes.y - center.y,
					);
				}),
			);
}

function readSeparationDelta(
	left: GraphGroupCluster,
	right: GraphGroupCluster,
	minimumDistance: number,
): { x: number; y: number } | undefined {
	let dx = right.x - left.x;
	let dy = right.y - left.y;
	let distance = Math.hypot(dx, dy);
	if (distance >= minimumDistance) {
		return undefined;
	}
	if (distance < 0.0001) {
		const direction = deterministicDirection(
			`${left.groupId}:${right.groupId}`,
		);
		dx = direction.x;
		dy = direction.y;
		distance = 1;
	}
	const overlap = minimumDistance - distance;
	return { x: (dx / distance) * overlap, y: (dy / distance) * overlap };
}

function translateNodes(
	graph: RuntimeGraph,
	nodeIds: string[],
	dx: number,
	dy: number,
): void {
	for (const nodeId of nodeIds) {
		const attributes = graph.getNodeAttributes(nodeId);
		graph.mergeNodeAttributes(nodeId, {
			x: attributes.x + dx,
			y: attributes.y + dy,
		});
	}
}

function deterministicDirection(key: string): { x: number; y: number } {
	let hash = 2166136261;
	for (let index = 0; index < key.length; index += 1) {
		hash ^= key.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
	return { x: Math.cos(angle), y: Math.sin(angle) };
}
