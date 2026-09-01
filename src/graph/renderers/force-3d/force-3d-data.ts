import type { LinkObject, NodeObject } from '3d-force-graph';
import type { LinkArrowStyle, NodeShape } from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import { getCanonicalParallelLane } from '../../model/parallel-edges';

export interface Force3DNode extends NodeObject {
	id: string;
	label: string;
	color: string;
	size: number;
	opacity?: number;
	shape?: NodeShape;
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
	opacity?: number;
	label: string;
	forceLabel: boolean;
	directed: boolean;
	arrowStyle?: LinkArrowStyle;
	arrowSize?: number;
	curvature?: number;
	curveRotation?: number;
	hidden: boolean;
	__lineObj?: { visible: boolean };
	__arrowObj?: { visible: boolean };
}

export interface Force3DStyleSyncResult {
	nodeLabelIds: Set<string>;
	linkLabelIds: Set<string>;
	nodeStyleChanged: boolean;
	nodeShapeChanged?: boolean;
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
		nodeShapeChanged: false,
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
		if (
			node.size !== attributes.size ||
			node.color !== attributes.color ||
			(node.opacity ?? 1) !== (attributes.opacity ?? 1)
		) {
			result.nodeStyleChanged = true;
		}
		if (node.shape !== (attributes.type ?? 'circle')) {
			result.nodeShapeChanged = true;
			result.nodeStyleChanged = true;
		}
		if (Boolean(node.hidden) !== Boolean(attributes.hidden)) {
			result.nodeVisibilityChanged = true;
		}
		node.label = attributes.label;
		node.color = attributes.color;
		node.size = attributes.size;
		if ((attributes.opacity ?? 1) === 1) {
			delete node.opacity;
		} else {
			node.opacity = attributes.opacity;
		}
		node.shape = attributes.type ?? 'circle';
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
		const nextCurvature = getForce3DLinkCurvature(attributes);
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
			(link.opacity ?? 1) !== (attributes.opacity ?? 1) ||
			(link.arrowSize ?? 1) !== (attributes.arrowSize ?? 1) ||
			link.directed !== attributes.type.includes('arrow') ||
			(link.arrowStyle ?? 'filled') !==
				(attributes.arrowStyle ?? 'filled') ||
			(link.curvature ?? 0) !== nextCurvature
		) {
			result.linkStyleChanged = true;
		}
		if (link.hidden !== nextHidden) {
			result.linkLabelIds.add(link.id);
			result.linkVisibilityChanged = true;
		}
		link.color = attributes.color;
		link.size = attributes.size;
		if ((attributes.opacity ?? 1) === 1) {
			delete link.opacity;
		} else {
			link.opacity = attributes.opacity;
		}
		if ((attributes.arrowSize ?? 1) === 1) {
			delete link.arrowSize;
		} else {
			link.arrowSize = attributes.arrowSize;
		}
		link.label = attributes.label;
		link.forceLabel = nextForceLabel;
		link.directed = attributes.type.includes('arrow');
		if (attributes.arrowStyle === 'chevron') {
			link.arrowStyle = 'chevron';
		} else {
			delete link.arrowStyle;
		}
		if (nextCurvature) {
			link.curvature = nextCurvature;
		} else {
			delete link.curvature;
			delete link.curveRotation;
		}
		if (nextCurvature) {
			link.curveRotation = 0;
		}
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
	if ((attributes.opacity ?? 1) === 1) {
		delete node.opacity;
	} else {
		node.opacity = attributes.opacity;
	}
	node.shape = attributes.type ?? 'circle';
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
	if ((attributes.opacity ?? 1) === 1) {
		delete link.opacity;
	} else {
		link.opacity = attributes.opacity;
	}
	if ((attributes.arrowSize ?? 1) === 1) {
		delete link.arrowSize;
	} else {
		link.arrowSize = attributes.arrowSize;
	}
	link.label = attributes.label;
	link.forceLabel = attributes.forceLabel;
	link.directed = attributes.type.includes('arrow');
	if (attributes.arrowStyle === 'chevron') {
		link.arrowStyle = 'chevron';
	} else {
		delete link.arrowStyle;
	}
	const curvature = getForce3DLinkCurvature(attributes);
	if (curvature) {
		link.curvature = curvature;
		link.curveRotation = 0;
	} else {
		delete link.curvature;
		delete link.curveRotation;
	}
	link.hidden = attributes.hidden;
	return link;
}

function getForce3DLinkCurvature(attributes: RuntimeEdgeAttributes): number {
	if (attributes.logicalEdgeId || (attributes.parallelCount ?? 1) <= 1) {
		return 0;
	}
	return getCanonicalParallelLane(attributes) * 0.24;
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
