import type { KnowledgeEdge } from './types';

type EdgeKindFields = Pick<KnowledgeEdge, 'kind' | 'semantic'>;

export function isPlainLinkEdge(edge: EdgeKindFields): boolean {
	return (
		edge.kind === 'plain-link' || (!edge.kind && edge.semantic === false)
	);
}

export function isUnresolvedLinkEdge(
	edge: Pick<KnowledgeEdge, 'kind'>,
): boolean {
	return edge.kind === 'unresolved-link';
}
