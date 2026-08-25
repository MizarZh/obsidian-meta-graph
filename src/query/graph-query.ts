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
	// An empty list means every configured metadata relationship is visible.
	relations: [],
	depth: 2,
	direction: 'both',
	maxNodes: 500,
	showIsolatedNodes: false,
	showPlainLinks: false,
	showUnresolvedLinks: false,
};
