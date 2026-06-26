import { cluster, hierarchy, type HierarchyPointNode } from 'd3-hierarchy';
import type { RuntimeGraph } from '../graph/graphology-adapter';
import type { LayoutEngine } from './layout-engine';

interface BundleNode {
	id?: string;
	name: string;
	label?: string;
	path?: string;
	children?: BundleNode[];
}

interface Point {
	x: number;
	y: number;
}

type BundlePoint = HierarchyPointNode<BundleNode>;

export class HierarchicalEdgeBundlingLayout implements LayoutEngine {
	constructor(private readonly spacing = 1) {}

	async apply(graph: RuntimeGraph): Promise<void> {
		const root = cluster<BundleNode>()
			.size([Math.PI * 2, calculateRadius(graph, this.spacing)])
			.separation((left, right) => (left.parent === right.parent ? 1 : 1.6))(
			hierarchy(createHierarchy(graph)).sort(
				(first, second) =>
					first.height - second.height ||
					first.data.name.localeCompare(second.data.name, undefined, {
						sensitivity: 'base',
					}),
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

		applyBundledEdges(graph, leafById);
	}
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
			sourceLeaf.path(targetLeaf).map((point) => toCartesian(point.x, point.y)),
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

function createHierarchy(graph: RuntimeGraph): BundleNode {
	const root: BundleNode = { name: 'Notes', children: [] };
	for (const nodeId of graph
		.nodes()
		.filter((id) => !graph.getNodeAttribute(id, 'isBend'))
		.sort((left, right) => {
			const leftPath = graph.getNodeAttribute(left, 'path') || left;
			const rightPath = graph.getNodeAttribute(right, 'path') || right;
			return leftPath.localeCompare(rightPath, undefined, { sensitivity: 'base' });
		})) {
		const attributes = graph.getNodeAttributes(nodeId);
		const parts = getHierarchySegments(attributes.path || nodeId, attributes.label);
		let parent = root;
		for (const segment of parts.slice(0, -1)) {
			parent = getOrCreateChild(parent, segment);
		}
		parent.children ??= [];
		parent.children.push({
			id: nodeId,
			name: parts.at(-1) ?? attributes.label,
			label: attributes.label,
			path: attributes.path,
		});
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
	const existing = parent.children.find((child) => child.name === name && !child.id);
	if (existing) {
		return existing;
	}
	const child: BundleNode = { name, children: [] };
	parent.children.push(child);
	return child;
}

function calculateRadius(graph: RuntimeGraph, spacing: number): number {
	const nodeCount = Math.max(
		1,
		graph.nodes().filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend')).length,
	);
	return Math.max(180, nodeCount * 18) * spacing;
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
