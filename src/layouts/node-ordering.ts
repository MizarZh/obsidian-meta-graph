import type {
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../graph/model/graphology-adapter';

export const DEFAULT_LAYOUT_NODE_SORT = 'name';
export const DEFAULT_LAYOUT_SORT_DIRECTION = 'asc';

export type LayoutNodeSort =
	| 'name'
	| 'path'
	| 'folder'
	| 'type'
	| 'tag'
	| 'domain'
	| 'created'
	| 'modified'
	| 'degree'
	| 'in-degree'
	| 'out-degree';

export type LayoutSortDirection = 'asc' | 'desc';

export function compareLayoutNodeIds(
	graph: RuntimeGraph,
	sort: LayoutNodeSort = DEFAULT_LAYOUT_NODE_SORT,
	direction: LayoutSortDirection = DEFAULT_LAYOUT_SORT_DIRECTION,
): (left: string, right: string) => number {
	const multiplier = direction === 'desc' ? -1 : 1;
	return (left, right) => {
		const leftAttributes = graph.getNodeAttributes(left);
		const rightAttributes = graph.getNodeAttributes(right);
		const primary =
			compareSortValue(graph, left, right, leftAttributes, rightAttributes, sort) *
			multiplier;
		return (
			primary ||
			compareText(leftAttributes.label, rightAttributes.label) ||
			compareText(leftAttributes.path, rightAttributes.path) ||
			compareText(left, right)
		);
	};
}

function compareSortValue(
	graph: RuntimeGraph,
	left: string,
	right: string,
	leftAttributes: RuntimeNodeAttributes,
	rightAttributes: RuntimeNodeAttributes,
	sort: LayoutNodeSort,
): number {
	switch (sort) {
		case 'path':
			return compareText(leftAttributes.path, rightAttributes.path);
		case 'folder':
			return (
				compareText(leftAttributes.folder, rightAttributes.folder) ||
				compareText(leftAttributes.label, rightAttributes.label)
			);
		case 'type':
			return compareText(
				leftAttributes.noteType ?? '',
				rightAttributes.noteType ?? '',
			);
		case 'tag':
			return compareText(
				readFirstValue(leftAttributes.tags),
				readFirstValue(rightAttributes.tags),
			);
		case 'domain':
			return compareText(
				readFirstValue(leftAttributes.domains),
				readFirstValue(rightAttributes.domains),
			);
		case 'created':
			return compareNumber(leftAttributes.createdTime, rightAttributes.createdTime);
		case 'modified':
			return compareNumber(
				leftAttributes.modifiedTime,
				rightAttributes.modifiedTime,
			);
		case 'degree':
			return compareNumber(readVisibleDegree(graph, left), readVisibleDegree(graph, right));
		case 'in-degree':
			return compareNumber(
				readVisibleDirectedDegree(graph, left, 'in'),
				readVisibleDirectedDegree(graph, right, 'in'),
			);
		case 'out-degree':
			return compareNumber(
				readVisibleDirectedDegree(graph, left, 'out'),
				readVisibleDirectedDegree(graph, right, 'out'),
			);
		case 'name':
			return compareText(leftAttributes.label, rightAttributes.label);
	}
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareNumber(left: number | undefined, right: number | undefined): number {
	if (left === undefined && right === undefined) {
		return 0;
	}
	if (left === undefined) {
		return 1;
	}
	if (right === undefined) {
		return -1;
	}
	return left - right;
}

function readFirstValue(values: string[]): string {
	return values[0] ?? '';
}

function readVisibleDegree(graph: RuntimeGraph, nodeId: string): number {
	let degree = 0;
	for (const edge of graph.edges(nodeId)) {
		const attributes = graph.getEdgeAttributes(edge);
		if (!attributes.hidden && attributes.semantic !== false) {
			degree += 1;
		}
	}
	return degree;
}

function readVisibleDirectedDegree(
	graph: RuntimeGraph,
	nodeId: string,
	direction: 'in' | 'out',
): number {
	let degree = 0;
	const edges =
		direction === 'in' ? graph.inEdges(nodeId) : graph.outEdges(nodeId);
	for (const edge of edges ?? []) {
		const attributes = graph.getEdgeAttributes(edge);
		if (!attributes.hidden && attributes.semantic !== false) {
			degree += 1;
		}
	}
	return degree;
}
