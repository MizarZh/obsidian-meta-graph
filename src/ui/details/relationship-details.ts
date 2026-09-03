import type { KnowledgeEdge } from '../../core/types';

export function getOtherLinksBetweenNotes(
	current: KnowledgeEdge,
	edges: readonly KnowledgeEdge[],
	visibleEdgeIds: ReadonlySet<string>,
): KnowledgeEdge[] {
	return edges
		.filter(
			(candidate) =>
				candidate.id !== current.id &&
				isSameNotePair(candidate, current) &&
				(!isNonSemanticLink(candidate) ||
					visibleEdgeIds.has(candidate.id)),
		)
		.sort(
			(left, right) =>
				Number(visibleEdgeIds.has(right.id)) -
					Number(visibleEdgeIds.has(left.id)) ||
				left.relation.localeCompare(right.relation, undefined, {
					sensitivity: 'base',
				}),
		);
}

function isNonSemanticLink(edge: KnowledgeEdge): boolean {
	return (
		edge.kind === 'plain-link' ||
		edge.kind === 'unresolved-link' ||
		(!edge.kind && edge.semantic === false)
	);
}

export function isSameNotePair(
	left: Pick<KnowledgeEdge, 'source' | 'target'>,
	right: Pick<KnowledgeEdge, 'source' | 'target'>,
): boolean {
	return (
		(left.source === right.source && left.target === right.target) ||
		(left.source === right.target && left.target === right.source)
	);
}
