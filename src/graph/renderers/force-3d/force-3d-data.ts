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
}

export interface Force3DStyleSyncResult {
	nodeLabelIds: Set<string>;
	linkLabelIds: Set<string>;
	nodeSizeChanged: boolean;
}

export function toForce3DData(graph: RuntimeGraph): {
	nodes: Force3DNode[];
	links: Force3DLink[];
} {
	return {
		nodes: graph
			.nodes()
			.filter((nodeId) => !graph.getNodeAttribute(nodeId, 'isBend'))
			.map((nodeId) =>
				toForce3DNode(nodeId, graph.getNodeAttributes(nodeId)),
			),
		links: graph.edges().map((edgeId) => {
			const attributes = graph.getEdgeAttributes(edgeId);
			return toForce3DLink(
				edgeId,
				graph.source(edgeId),
				graph.target(edgeId),
				attributes,
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
		nodeSizeChanged: false,
	};
	for (const node of data.nodes) {
		if (!graph.hasNode(node.id)) {
			continue;
		}
		const attributes = graph.getNodeAttributes(node.id);
		if (node.label !== attributes.label) {
			result.nodeLabelIds.add(node.id);
		}
		if (node.size !== attributes.size) {
			result.nodeSizeChanged = true;
		}
		node.label = attributes.label;
		node.color = attributes.color;
		node.size = attributes.size;
		node.path = attributes.path;
		node.isPrimary = attributes.isPrimary;
		node.isContext = attributes.isContext;
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
			link.forceLabel !== nextForceLabel ||
			link.hidden !== nextHidden
		) {
			result.linkLabelIds.add(link.id);
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
): Force3DNode {
	return {
		id: nodeId,
		label: attributes.label,
		color: attributes.color,
		size: attributes.size,
		path: attributes.path,
		isPrimary: attributes.isPrimary,
		isContext: attributes.isContext,
		x: attributes.x,
		y: attributes.y,
	};
}

function toForce3DLink(
	edgeId: string,
	source: string,
	target: string,
	attributes: RuntimeEdgeAttributes,
): Force3DLink {
	return {
		id: edgeId,
		source: attributes.logicalSource ?? source,
		target: attributes.logicalTarget ?? target,
		color: attributes.color,
		size: attributes.size,
			label: attributes.label,
			forceLabel: attributes.forceLabel,
		directed: attributes.type.includes('arrow'),
		hidden: attributes.hidden,
	};
}
