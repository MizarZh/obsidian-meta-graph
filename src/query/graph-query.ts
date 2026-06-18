import type { GraphQuery } from '../core/types';

export const DEFAULT_GRAPH_QUERY: GraphQuery = {
	roots: [],
	folders: [],
	tags: [],
	hiddenNodeRules: [],
	domains: [],
	relations: ['prerequisite', 'leads-to', 'related'],
	depth: 2,
	direction: 'both',
	maxNodes: 200,
};
