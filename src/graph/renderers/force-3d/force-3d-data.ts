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
	directed: boolean;
	hidden: boolean;
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
		label: attributes.label || attributes.relation,
		directed: attributes.type.includes('arrow'),
		hidden: attributes.hidden,
	};
}
