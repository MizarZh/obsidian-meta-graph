import type { LinkObject, NodeObject } from '3d-force-graph';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';

export interface Force3DNode extends NodeObject {
	id: string;
	label: string;
	color: string;
	size: number;
	path: string;
	isPrimary?: boolean;
	isContext?: boolean;
	hidden?: boolean;
	__threeObj?: { visible: boolean };
}

export interface Force3DLink extends LinkObject<Force3DNode> {
	id: string;
	source: string | number | Force3DNode;
	target: string | number | Force3DNode;
	color: string;
	size: number;
	label: string;
	forceLabel: boolean;
	directed: boolean;
	hidden: boolean;
	__lineObj?: { visible: boolean };
	__arrowObj?: { visible: boolean };
}

export interface Force3DStyleSyncResult {
	nodeLabelIds: Set<string>;
	linkLabelIds: Set<string>;
	nodeStyleChanged: boolean;
	nodeVisibilityChanged: boolean;
	linkStyleChanged: boolean;
	linkVisibilityChanged: boolean;
}

export function toForce3DData(
	graph: RuntimeGraph,
	nodeCache: ReadonlyMap<string, Force3DNode> = new Map(),
	linkCache: ReadonlyMap<string, Force3DLink> = new Map(),
): {
	nodes: Force3DNode[];
	links: Force3DLink[];
} {
	const visibleNodeIds = new Set(
		graph.nodes().filter((nodeId) => isVisibleForceNode(graph, nodeId)),
	);
	return {
		nodes: [...visibleNodeIds].map((nodeId) =>
			toForce3DNode(
				nodeId,
				graph.getNodeAttributes(nodeId),
				nodeCache.get(nodeId),
			),
		),
		links: graph
			.edges()
			.filter((edgeId) =>
				isVisibleForceLink(graph, edgeId, visibleNodeIds),
			)
			.map((edgeId) => {
				const attributes = graph.getEdgeAttributes(edgeId);
				return toForce3DLink(
					edgeId,
					graph.source(edgeId),
					graph.target(edgeId),
					attributes,
					linkCache.get(edgeId),
				);
			}),
	};
}

export function syncForce3DDataStyles(
	graph: RuntimeGraph,
	data: { nodes: Force3DNode[]; links: Force3DLink[] },
): Force3DStyleSyncResult {
	const result: Force3DStyleSyncResult = {
		nodeLabelIds: new Set(),
		linkLabelIds: new Set(),
		nodeStyleChanged: false,
		nodeVisibilityChanged: false,
		linkStyleChanged: false,
		linkVisibilityChanged: false,
	};
	const dataNodeIds = new Set(data.nodes.map((node) => node.id));
	const visibleNodeIds = new Set(
		graph.nodes().filter((nodeId) => isVisibleForceNode(graph, nodeId)),
	);
	if (!setsEqual(dataNodeIds, visibleNodeIds)) {
		result.nodeVisibilityChanged = true;
	}
	const dataLinkIds = new Set(data.links.map((link) => link.id));
	const visibleLinkIds = new Set(
		graph
			.edges()
			.filter((edgeId) =>
				isVisibleForceLink(graph, edgeId, visibleNodeIds),
			),
	);
	if (!setsEqual(dataLinkIds, visibleLinkIds)) {
		result.linkVisibilityChanged = true;
	}
	for (const node of data.nodes) {
		if (!graph.hasNode(node.id)) {
			continue;
		}
		const attributes = graph.getNodeAttributes(node.id);
		if (node.label !== attributes.label) {
			result.nodeLabelIds.add(node.id);
			result.nodeStyleChanged = true;
		}
		if (node.size !== attributes.size || node.color !== attributes.color) {
			result.nodeStyleChanged = true;
		}
		if (Boolean(node.hidden) !== Boolean(attributes.hidden)) {
			result.nodeVisibilityChanged = true;
		}
		node.label = attributes.label;
		node.color = attributes.color;
		node.size = attributes.size;
		node.path = attributes.path;
		node.isPrimary = attributes.isPrimary;
		node.isContext = attributes.isContext;
		node.hidden = attributes.hidden;
	}

	for (const link of data.links) {
		if (!graph.hasEdge(link.id)) {
			continue;
		}
		const attributes = graph.getEdgeAttributes(link.id);
		const nextForceLabel = attributes.forceLabel;
		const nextHidden = attributes.hidden;
		if (
			link.label !== attributes.label ||
			link.forceLabel !== nextForceLabel
		) {
			result.linkLabelIds.add(link.id);
			result.linkStyleChanged = true;
		}
		if (
			link.color !== attributes.color ||
			link.size !== attributes.size ||
			link.directed !== attributes.type.includes('arrow')
		) {
			result.linkStyleChanged = true;
		}
		if (link.hidden !== nextHidden) {
			result.linkLabelIds.add(link.id);
			result.linkVisibilityChanged = true;
		}
		link.color = attributes.color;
		link.size = attributes.size;
		link.label = attributes.label;
		link.forceLabel = nextForceLabel;
		link.directed = attributes.type.includes('arrow');
		link.hidden = nextHidden;
	}
	return result;
}

export function getLinkEndpointId(
	endpoint: string | number | Force3DNode | undefined,
): string {
	if (typeof endpoint === 'object' && endpoint) {
		return endpoint.id;
	}
	return String(endpoint ?? '');
}

export function hasFiniteCoordinates(
	node: Force3DNode,
): node is Force3DNode & { x: number; y: number; z: number } {
	return (
		typeof node.x === 'number' &&
		Number.isFinite(node.x) &&
		typeof node.y === 'number' &&
		Number.isFinite(node.y) &&
		typeof node.z === 'number' &&
		Number.isFinite(node.z)
	);
}

function toForce3DNode(
	nodeId: string,
	attributes: RuntimeNodeAttributes,
	reusable?: Force3DNode,
): Force3DNode {
	const node = reusable ?? ({} as Force3DNode);
	node.id = nodeId;
	node.label = attributes.label;
	node.color = attributes.color;
	node.size = attributes.size;
	node.path = attributes.path;
	node.isPrimary = attributes.isPrimary;
	node.isContext = attributes.isContext;
	node.hidden = attributes.hidden;
	if (typeof node.x !== 'number' || !Number.isFinite(node.x)) {
		node.x = attributes.x;
	}
	if (typeof node.y !== 'number' || !Number.isFinite(node.y)) {
		node.y = attributes.y;
	}
	return node;
}

function toForce3DLink(
	edgeId: string,
	source: string,
	target: string,
	attributes: RuntimeEdgeAttributes,
	reusable?: Force3DLink,
): Force3DLink {
	const link = reusable ?? ({} as Force3DLink);
	link.id = edgeId;
	link.source = attributes.logicalSource ?? source;
	link.target = attributes.logicalTarget ?? target;
	link.color = attributes.color;
	link.size = attributes.size;
	link.label = attributes.label;
	link.forceLabel = attributes.forceLabel;
	link.directed = attributes.type.includes('arrow');
	link.hidden = attributes.hidden;
	return link;
}

function isVisibleForceNode(graph: RuntimeGraph, nodeId: string): boolean {
	const attributes = graph.getNodeAttributes(nodeId);
	return !attributes.isBend && !attributes.hidden;
}

function isVisibleForceLink(
	graph: RuntimeGraph,
	edgeId: string,
	visibleNodeIds: ReadonlySet<string>,
): boolean {
	return (
		!graph.getEdgeAttribute(edgeId, 'hidden') &&
		visibleNodeIds.has(graph.source(edgeId)) &&
		visibleNodeIds.has(graph.target(edgeId))
	);
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const value of left) {
		if (!right.has(value)) {
			return false;
		}
	}
	return true;
}
