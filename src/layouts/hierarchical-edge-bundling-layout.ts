import {
	cluster,
	hierarchy,
	type HierarchyNode,
	type HierarchyPointNode,
} from 'd3-hierarchy';
import type { ChartGroupDefinition } from '../core/types';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';
import {
	normalizeLayoutGroupPadding,
	type RadialGroupGeometry,
} from './group-geometry';
import type { LayoutEngine } from './layout-engine';
import {
	compareLayoutNodeIds,
	type LayoutNodeSort,
	type LayoutSortDirection,
} from './node-ordering';

interface BundleNode {
	id?: string;
	name: string;
	label?: string;
	path?: string;
	kind?: 'root' | 'group' | 'ungrouped' | 'folder' | 'note';
	groupId?: string;
	groupOrder?: number;
	children?: BundleNode[];
}

interface Point {
	x: number;
	y: number;
}

type BundlePoint = HierarchyPointNode<BundleNode>;

export class HierarchicalEdgeBundlingLayout implements LayoutEngine {
	private groupGeometries: RadialGroupGeometry[] = [];

	constructor(
		private readonly spacing = 1,
		private readonly nodeSort: LayoutNodeSort = 'path',
		private readonly nodeSortDirection: LayoutSortDirection = 'asc',
		private readonly groups: readonly ChartGroupDefinition[] = [],
		private readonly groupByNode: ReadonlyMap<string, string> = new Map(),
	) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const compareLeaves = compareLayoutNodeIds(
			graph,
			this.nodeSort,
			this.nodeSortDirection,
		);
		const radius = calculateRadius(graph, this.spacing);
		const root = cluster<BundleNode>()
			.size([calculateAngularRange(graph), radius])
			.separation((left, right) =>
				left.parent === right.parent ? 1 : 1.6,
			)(
			hierarchy(
				createHierarchy(graph, this.groups, this.groupByNode),
			).sort((first, second) =>
				compareBundleNodes(first, second, compareLeaves),
			),
		);
		const leaves = root.leaves().filter((leaf) => leaf.data.id);
		const leafById = new Map<string, BundlePoint>();
		for (const leaf of leaves) {
			if (leaf.data.id) {
				leafById.set(leaf.data.id, leaf);
			}
		}

		for (const leaf of leaves) {
			const id = leaf.data.id;
			if (!id) {
				continue;
			}
			const labelPlacement = getRadialLabelPlacement(leaf.x);
			graph.mergeNodeAttributes(id, {
				...toCartesian(leaf.x, leaf.y),
				fixed: true,
				labelRotation: labelPlacement.rotation,
				labelDirection: labelPlacement.direction,
			});
		}
		this.groupGeometries = createRadialGroupGeometries(
			root,
			radius,
			this.groups,
		);

		applyBundledEdges(graph, leafById);
	}

	getGroupGeometries(): RadialGroupGeometry[] {
		return this.groupGeometries.map((geometry) => ({ ...geometry }));
	}
}

function compareBundleNodes(
	first: HierarchyNode<BundleNode>,
	second: HierarchyNode<BundleNode>,
	compareLeaves: (left: string, right: string) => number,
): number {
	if (
		(first.data.kind === 'group' || first.data.kind === 'ungrouped') &&
		(second.data.kind === 'group' || second.data.kind === 'ungrouped')
	) {
		return (first.data.groupOrder ?? 0) - (second.data.groupOrder ?? 0);
	}
	if (first.data.id && second.data.id) {
		return compareLeaves(first.data.id, second.data.id);
	}
	return (
		first.height - second.height ||
		first.data.name.localeCompare(second.data.name, undefined, {
			sensitivity: 'base',
		})
	);
}

function applyBundledEdges(
	graph: RuntimeGraph,
	leafById: ReadonlyMap<string, BundlePoint>,
): void {
	const logicalEdges = graph
		.edges()
		.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden'));

	for (const edge of logicalEdges) {
		const source = graph.source(edge);
		const target = graph.target(edge);
		const sourceLeaf = leafById.get(source);
		const targetLeaf = leafById.get(target);
		if (!sourceLeaf || !targetLeaf) {
			continue;
		}
		const directed = graph.isDirected(edge);
		const attributes = graph.getEdgeAttributes(edge);
		const points = smoothPoints(
			sourceLeaf
				.path(targetLeaf)
				.map((point) => toCartesian(point.x, point.y)),
		);
		if (points.length < 2) {
			continue;
		}

		graph.dropEdge(edge);
		const pathNodes = [source];
		for (const [index, point] of points.slice(1, -1).entries()) {
			const bendNode = `__hierarchical-edge-bundling-bend__${edge}__${index + 1}`;
			graph.addNode(bendNode, createBendNode(point.x, point.y));
			pathNodes.push(bendNode);
		}
		pathNodes.push(target);

		const labelSegment = Math.floor((pathNodes.length - 2) / 2);
		for (let index = 0; index < pathNodes.length - 1; index += 1) {
			const segmentSource = pathNodes[index];
			const segmentTarget = pathNodes[index + 1];
			if (!segmentSource || !segmentTarget) {
				continue;
			}
			const lastSegment = index === pathNodes.length - 2;
			const segmentAttributes = {
				...attributes,
				type:
					directed && lastSegment
						? attributes.lineStyle === 'solid'
							? 'arrow'
							: `${attributes.lineStyle}-arrow`
						: attributes.lineStyle === 'solid'
							? 'line'
							: attributes.lineStyle,
				label: index === labelSegment ? attributes.label : '',
				forceLabel: index === labelSegment && Boolean(attributes.label),
				logicalEdgeId: edge,
				logicalSource: source,
				logicalTarget: target,
			};
			const segmentKey = `${edge}__hierarchical_edge_bundling_segment_${index + 1}`;
			if (directed) {
				graph.addDirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					segmentAttributes,
				);
			} else {
				graph.addUndirectedEdgeWithKey(
					segmentKey,
					segmentSource,
					segmentTarget,
					segmentAttributes,
				);
			}
		}
	}
}

function createHierarchy(
	graph: RuntimeGraph,
	groups: readonly ChartGroupDefinition[] = [],
	groupByNode: ReadonlyMap<string, string> = new Map(),
): BundleNode {
	const root: BundleNode = { name: 'Notes', kind: 'root', children: [] };
	const nodeIds = graph
		.nodes()
		.filter((id) => !graph.getNodeAttribute(id, 'isBend'))
		.sort((left, right) => {
			const leftPath = graph.getNodeAttribute(left, 'path') || left;
			const rightPath = graph.getNodeAttribute(right, 'path') || right;
			return leftPath.localeCompare(rightPath, undefined, {
				sensitivity: 'base',
			});
		});
	const groupById = new Map(
		groups.map((group) => [group.id, group] as const),
	);
	const assignedGroupIds = new Set(
		nodeIds
			.map((nodeId) => groupByNode.get(nodeId))
			.filter((groupId): groupId is string =>
				Boolean(groupId && groupById.has(groupId)),
			),
	);
	const useGroupHierarchy = assignedGroupIds.size > 0;
	const groupParents = new Map<string, BundleNode>();
	if (useGroupHierarchy) {
		for (const [index, group] of groups.entries()) {
			if (!assignedGroupIds.has(group.id)) {
				continue;
			}
			const parent: BundleNode = {
				name: group.name,
				kind: 'group',
				groupId: group.id,
				groupOrder: index,
				children: [],
			};
			root.children?.push(parent);
			groupParents.set(group.id, parent);
		}
	}
	const ungroupedParent: BundleNode | undefined = useGroupHierarchy
		? {
				name: 'Ungrouped',
				kind: 'ungrouped',
				groupOrder: groups.length,
				children: [],
			}
		: undefined;

	for (const nodeId of nodeIds) {
		const attributes = graph.getNodeAttributes(nodeId);
		const parts = getHierarchySegments(
			attributes.path || nodeId,
			attributes.label,
		);
		const assignedGroupId = groupByNode.get(nodeId);
		let parent =
			(assignedGroupId ? groupParents.get(assignedGroupId) : undefined) ??
			ungroupedParent ??
			root;
		for (const segment of parts.slice(0, -1)) {
			parent = getOrCreateChild(parent, segment);
		}
		parent.children ??= [];
		parent.children.push({
			id: nodeId,
			name: parts.at(-1) ?? attributes.label,
			label: attributes.label,
			path: attributes.path,
			kind: 'note',
		});
	}
	if (ungroupedParent?.children?.length) {
		root.children?.push(ungroupedParent);
	}
	return root;
}

function getHierarchySegments(path: string, label: string): string[] {
	const parts = path.split('/').filter(Boolean);
	if (parts.length === 0) {
		return [label || path];
	}
	parts[parts.length - 1] =
		(parts.at(-1) ?? label).replace(/\.[^.]+$/u, '') || label || path;
	return parts;
}

function getOrCreateChild(parent: BundleNode, name: string): BundleNode {
	parent.children ??= [];
	const existing = parent.children.find(
		(child) => child.name === name && !child.id,
	);
	if (existing) {
		return existing;
	}
	const child: BundleNode = { name, kind: 'folder', children: [] };
	parent.children.push(child);
	return child;
}

function createRadialGroupGeometries(
	root: BundlePoint,
	radius: number,
	groups: readonly ChartGroupDefinition[],
): RadialGroupGeometry[] {
	const visibleLeafCount = root
		.leaves()
		.filter((leaf) => leaf.data.id).length;
	const angularStep = (Math.PI * 2) / Math.max(visibleLeafCount, 1);
	const pointByGroupId = new Map(
		(root.children ?? [])
			.filter(
				(child) => child.data.kind === 'group' && child.data.groupId,
			)
			.map((child) => [child.data.groupId as string, child] as const),
	);
	return groups.flatMap((group) => {
		const point = pointByGroupId.get(group.id);
		const angles = point
			?.leaves()
			.filter((leaf) => leaf.data.id)
			.map((leaf) => leaf.x)
			.sort((left, right) => left - right);
		if (!angles?.length) {
			return [];
		}
		const padding = normalizeLayoutGroupPadding(group.padding);
		const angularPadding = angularStep * (0.08 + padding * 0.61);
		return [
			{
				kind: 'radial-sector' as const,
				groupId: group.id,
				name: group.name,
				color: group.color,
				startAngle: (angles[0] ?? 0) - angularPadding,
				endAngle: (angles.at(-1) ?? 0) + angularPadding,
				innerRadius: radius * (0.92 - padding * 0.18),
				outerRadius: radius * (1.01 + padding * 0.094),
			},
		];
	});
}

function calculateRadius(graph: RuntimeGraph, spacing: number): number {
	const nodeCount = Math.max(
		1,
		graph
			.nodes()
			.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'))
			.length,
	);
	return Math.max(180, nodeCount * 18) * spacing;
}

function calculateAngularRange(graph: RuntimeGraph): number {
	const nodeCount = Math.max(
		1,
		graph
			.nodes()
			.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'))
			.length,
	);
	return Math.PI * 2 * ((nodeCount - 1) / nodeCount);
}

function toCartesian(angle: number, radius: number): Point {
	return {
		x: Math.cos(angle - Math.PI / 2) * radius,
		y: Math.sin(angle - Math.PI / 2) * radius,
	};
}

export function getRadialLabelPlacement(angle: number): {
	rotation: number;
	direction: 1 | -1;
} {
	const leftSide = angle > Math.PI;
	const rotation = Math.PI / 2 - angle + (leftSide ? Math.PI : 0);
	return {
		rotation,
		direction: leftSide ? -1 : 1,
	};
}

function smoothPoints(points: Point[]): Point[] {
	let smoothed = points;
	for (let pass = 0; pass < 3; pass += 1) {
		if (smoothed.length < 3) {
			break;
		}
		const next = [smoothed[0]];
		for (let index = 0; index < smoothed.length - 1; index += 1) {
			const current = smoothed[index];
			const following = smoothed[index + 1];
			if (!current || !following) {
				continue;
			}
			next.push(
				{
					x: current.x * 0.75 + following.x * 0.25,
					y: current.y * 0.75 + following.y * 0.25,
				},
				{
					x: current.x * 0.25 + following.x * 0.75,
					y: current.y * 0.25 + following.y * 0.75,
				},
			);
		}
		next.push(smoothed.at(-1));
		smoothed = next.filter((point): point is Point => point !== undefined);
	}
	return smoothed;
}

function createBendNode(x: number, y: number) {
	return {
		label: '',
		x,
		y,
		size: 0.01,
		color: 'rgba(0, 0, 0, 0)',
		path: '',
		folder: '',
		domains: [],
		tags: [],
		fixed: true,
		isBend: true,
	};
}
