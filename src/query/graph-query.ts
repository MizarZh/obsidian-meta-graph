import type { GraphQuery } from '../core/types';

export const DEFAULT_GRAPH_QUERY: GraphQuery = {
	roots: [],
	folders: [],
	tags: [],
	hiddenNodeRules: [],
	filterRoot: {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children: [],
	},
	domains: [],
	relations: ['prerequisite', 'leads-to', 'related'],
	depth: 2,
	direction: 'both',
	maxNodes: 500,
	showIsolatedNodes: false,
	showPlainLinks: false,
	showUnresolvedLinks: false,
};
