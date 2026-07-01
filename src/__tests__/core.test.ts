import { describe, expect, it, vi } from 'vitest';
import {
	addEdge,
	addNode,
	createEdgeId,
	createKnowledgeIndex,
} from '../core/knowledge-index';
import type { LinkResolver } from '../core/link-resolver';
import { parseRelations, toStringArray } from '../core/relation-parser';
import type {
	DirectionMode,
	GraphQuery,
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	RelationType,
} from '../core/types';
import { CuratedProjectionEngine } from '../query/curated';
import { GraphQueryEngine } from '../query/neighborhood';

const resolver: LinkResolver = {
	resolve(linkText) {
		return {
			A: 'A.md',
			B: 'B.md',
			C: 'C.md',
			D: 'D.md',
		}[linkText];
	},
};

describe('metadata relation parsing', () => {
	it('parses scalar and array metadata', () => {
		expect(toStringArray(' astronomy ')).toEqual(['astronomy']);
		expect(toStringArray(['astronomy', 'physics'])).toEqual([
			'astronomy',
			'physics',
		]);
		expect(
			parseRelations(
				{ leads_to: '[[B]]', related: ['[[C]]', '[[D]]'] },
				'A.md',
				resolver,
			),
		).toHaveLength(3);
	});

	it('reverses prerequisite direction', () => {
		const [edge] = parseRelations(
			{ prerequisites: '[[B]]' },
			'A.md',
			resolver,
		);
		expect(edge).toMatchObject({
			source: 'B.md',
			target: 'A.md',
			relation: 'prerequisite',
			directed: true,
		});
	});

	it('keeps leads-to direction', () => {
		const [edge] = parseRelations({ leads_to: '[[B]]' }, 'A.md', resolver);
		expect(edge).toMatchObject({
			source: 'A.md',
			target: 'B.md',
			relation: 'leads-to',
			directed: true,
		});
	});

	it('supports common relation property aliases', () => {
		expect(
			parseRelations(
				{
					prerequisite: '[[B]]',
					'leads-to': '[[C]]',
				},
				'A.md',
				resolver,
			),
		).toHaveLength(2);
	});

	it('uses cached frontmatter links when property values are unavailable', () => {
		const [edge] = parseRelations(
			{ related: null },
			'A.md',
			resolver,
			undefined,
			[{ key: 'related.0', link: 'B' }],
		);
		expect(edge).toMatchObject({
			source: 'A.md',
			target: 'B.md',
			relation: 'related',
		});
	});

	it('creates an undirected related relation', () => {
		const [edge] = parseRelations({ related: '[[B]]' }, 'A.md', resolver);
		expect(edge).toMatchObject({
			source: 'A.md',
			target: 'B.md',
			relation: 'related',
			directed: false,
		});
	});

	it('eliminates duplicate relationships', () => {
		const edges = parseRelations(
			{ related: ['[[B]]', '[[B]]'] },
			'A.md',
			resolver,
		);
		expect(edges).toHaveLength(1);

		const index = createKnowledgeIndex();
		addEdge(index, edges[0] as KnowledgeEdge);
		const reverse = parseRelations({ related: '[[A]]' }, 'B.md', resolver);
		addEdge(index, reverse[0] as KnowledgeEdge);
		expect(index.edges).toHaveLength(1);
	});

	it('ignores missing links and reports them', () => {
		const onUnresolved = vi.fn();
		const edges = parseRelations(
			{ leads_to: '[[Missing]]' },
			'A.md',
			resolver,
			onUnresolved,
		);
		expect(edges).toEqual([]);
		expect(onUnresolved).toHaveBeenCalledWith('Missing', 'A.md');
	});
});

describe('breadth-first neighborhood query', () => {
	it('projects all connected components when roots are empty', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C'), node('D'), node('E')],
			[edge('A', 'B'), edge('C', 'D')],
		);
		expect(projectIds(index, query({ roots: [] }))).toEqual([
			'A',
			'B',
			'C',
			'D',
		]);
	});

	it('applies node filters to global projections', () => {
		const index = buildIndex(
			[
				node('A', 'one'),
				node('B', 'one'),
				node('C', 'two'),
				node('D', 'two'),
			],
			[edge('A', 'B'), edge('C', 'D')],
		);
		expect(
			projectIds(index, query({ roots: [], folders: ['two'] })),
		).toEqual(['C', 'D']);
	});

	it('applies recursive node filter groups', () => {
		const a = {
			...node('A'),
			metadata: { status: 'draft', type: 'concept' },
			metadataFields: ['status', 'type'],
		};
		const b = {
			...node('B'),
			metadata: { status: 'done', type: 'concept' },
			metadataFields: ['status', 'type'],
		};
		const c = {
			...node('C'),
			aliases: ['target'],
			metadata: { status: 'draft', type: 'note' },
			metadataFields: ['status', 'type'],
		};
		const index = buildIndex([a, b, c], [edge('A', 'B'), edge('A', 'C')]);

		expect(
			projectIds(
				index,
				query({
					roots: [],
					filterRoot: {
						id: 'root',
						kind: 'group',
						mode: 'all',
						children: [
							{
								id: 'include',
								kind: 'group',
								mode: 'any',
								children: [
									{
										id: 'type',
										kind: 'condition',
										field: 'metadata.type',
										operator: 'is',
										value: 'concept',
									},
									{
										id: 'alias',
										kind: 'condition',
										field: 'aliases',
										operator: 'contains',
										value: 'target',
									},
								],
							},
							{
								id: 'exclude',
								kind: 'group',
								mode: 'none',
								children: [
									{
										id: 'done',
										kind: 'condition',
										field: 'metadata.status',
										operator: 'is',
										value: 'done',
									},
								],
							},
						],
					},
				}),
			),
		).toEqual(['A', 'C']);
	});

	it('caps global projections at maxNodes without orphan edges', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C'), node('D')],
			[edge('A', 'B'), edge('C', 'D')],
		);
		const projection = new GraphQueryEngine().project(
			index,
			query({ roots: [], maxNodes: 2 }),
		);
		expect(projection.nodes.map((item) => item.id).sort()).toEqual([
			'A',
			'B',
		]);
		expect(projection.edges).toHaveLength(1);
	});

	it('omits an isolated root when there are no relationships', () => {
		const index = buildIndex([node('A')], []);
		const projection = new GraphQueryEngine().project(index, query());

		expect(projection.nodes).toEqual([]);
		expect(projection.edges).toEqual([]);
		expect(projection.rootIds.size).toBe(0);
	});

	it('omits nodes when relation filters remove every edge', () => {
		const index = buildIndex(
			[node('A'), node('B')],
			[edge('A', 'B', 'leads-to')],
		);
		const projection = new GraphQueryEngine().project(
			index,
			query({ relations: ['related'] }),
		);

		expect(projection.nodes).toEqual([]);
		expect(projection.edges).toEqual([]);
	});

	it('honors BFS depth', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C'), node('D')],
			[edge('A', 'B'), edge('B', 'C'), edge('C', 'D')],
		);
		expect(projectIds(index, query({ depth: 2 }))).toEqual(['A', 'B', 'C']);
	});

	it('handles cycles without repeating nodes', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C')],
			[edge('A', 'B'), edge('B', 'C'), edge('C', 'A')],
		);
		expect(projectIds(index, query({ depth: 10 }))).toEqual([
			'A',
			'B',
			'C',
		]);
	});

	it.each<[DirectionMode, string[]]>([
		['outgoing', ['A', 'B']],
		['incoming', ['A', 'C']],
		['both', ['A', 'B', 'C']],
	])('supports %s traversal', (direction, expected) => {
		const index = buildIndex(
			[node('A'), node('B'), node('C')],
			[edge('A', 'B'), edge('C', 'A')],
		);
		expect(projectIds(index, query({ direction, depth: 1 }))).toEqual(
			expected,
		);
	});

	it('applies folder filters while retaining the root', () => {
		const index = buildIndex(
			[node('A', 'root'), node('B', 'included'), node('C', 'excluded')],
			[edge('A', 'B'), edge('A', 'C')],
		);
		expect(projectIds(index, query({ folders: ['included'] }))).toEqual([
			'A',
			'B',
		]);
	});

	it('applies domain filters', () => {
		const index = buildIndex(
			[
				node('A'),
				node('B', '', ['astronomy']),
				node('C', '', ['biology']),
			],
			[edge('A', 'B'), edge('A', 'C')],
		);
		expect(projectIds(index, query({ domains: ['astronomy'] }))).toEqual([
			'A',
			'B',
		]);
	});

	it('applies tag filters', () => {
		const taggedNode = node('B');
		taggedNode.tags = ['important'];
		const otherNode = node('C');
		otherNode.tags = ['other'];
		const index = buildIndex(
			[node('A'), taggedNode, otherNode],
			[edge('A', 'B'), edge('A', 'C')],
		);
		expect(projectIds(index, query({ tags: ['important'] }))).toEqual([
			'A',
			'B',
		]);
	});

	it('hides folders through filter rules', () => {
		const index = buildIndex(
			[
				node('A', 'one'),
				node('B', 'one'),
				node('C', 'hidden'),
				node('D', 'hidden/nested'),
			],
			[edge('A', 'B'), edge('C', 'D')],
		);
		expect(
			projectIds(
				index,
				query({
					roots: [],
					hiddenNodeRules: [
						{
							id: 'hide-folder',
							action: 'hide',
							field: 'folder',
							value: 'hidden',
						},
					],
				}),
			),
		).toEqual(['A', 'B']);
	});

	it('hides tags through filter rules', () => {
		const visibleA = node('A');
		const visibleB = node('B');
		const hiddenC = node('C');
		const hiddenD = node('D');
		hiddenC.tags = ['private'];
		hiddenD.tags = ['private'];
		const index = buildIndex(
			[visibleA, visibleB, hiddenC, hiddenD],
			[edge('A', 'B'), edge('C', 'D')],
		);
		expect(
			projectIds(
				index,
				query({
					roots: [],
					hiddenNodeRules: [
						{
							id: 'hide-tag',
							action: 'hide',
							field: 'tag',
							value: 'private',
						},
					],
				}),
			),
		).toEqual(['A', 'B']);
	});

	it('shows nodes matching any show rule', () => {
		const taggedA = node('A', 'one');
		const taggedB = node('B', 'one');
		taggedA.tags = ['public'];
		taggedB.tags = ['public'];
		const index = buildIndex(
			[taggedA, taggedB, node('C', 'private'), node('D', 'private')],
			[edge('A', 'B'), edge('C', 'D')],
		);
		expect(
			projectIds(
				index,
				query({
					roots: [],
					hiddenNodeRules: [
						{
							id: 'show-public',
							action: 'show',
							field: 'tag',
							value: 'public',
						},
					],
				}),
			),
		).toEqual(['A', 'B']);
	});

	it('gives hide rules priority over show rules', () => {
		const visibleA = node('A', 'one');
		const hiddenB = node('B', 'one');
		const hiddenC = node('C', 'one');
		visibleA.tags = ['public'];
		hiddenB.tags = ['public', 'private'];
		hiddenC.tags = ['private'];
		const index = buildIndex(
			[visibleA, hiddenB, hiddenC],
			[edge('A', 'B'), edge('A', 'C')],
		);
		const projection = new GraphQueryEngine().project(
			index,
			query({
				roots: [],
				hiddenNodeRules: [
					{
						id: 'show-folder',
						action: 'show',
						field: 'folder',
						value: 'one',
					},
					{
						id: 'hide-private',
						action: 'hide',
						field: 'tag',
						value: 'private',
					},
				],
			}),
		);
		expect(projection.nodes).toEqual([]);
		expect(projection.edges).toEqual([]);
	});

	it('applies relation filters', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C')],
			[edge('A', 'B', 'leads-to'), edge('A', 'C', 'related', false)],
		);
		expect(projectIds(index, query({ relations: ['related'] }))).toEqual([
			'A',
			'C',
		]);
	});
});

describe('curated workspace projection', () => {
	it('keeps selected files visible even when they have no edges', () => {
		const index = buildIndex([node('A'), node('B')], []);
		const projection = new CuratedProjectionEngine().project(index, {
			files: [{ path: 'A' }, { path: 'B' }],
			context: {
				enabled: false,
				depth: 0,
				includeOutgoingLinks: true,
				includeBacklinks: true,
				includeMetadataRelations: true,
			},
		});

		expect(projection.nodes.map((item) => item.id).sort()).toEqual([
			'A',
			'B',
		]);
		expect(projection.edges).toEqual([]);
		expect(projection.primaryIds).toEqual(new Set(['A', 'B']));
	});

	it('only includes edges between selected files', () => {
		const index = buildIndex(
			[node('A'), node('B'), node('C')],
			[edge('A', 'B'), edge('B', 'C')],
		);
		const projection = new CuratedProjectionEngine().project(index, {
			files: [{ path: 'A' }, { path: 'B' }],
			context: {
				enabled: false,
				depth: 0,
				includeOutgoingLinks: true,
				includeBacklinks: true,
				includeMetadataRelations: true,
			},
		});

		expect(projection.nodes.map((item) => item.id).sort()).toEqual([
			'A',
			'B',
		]);
		expect(projection.edges.map((item) => item.id)).toEqual([
			createEdgeId('A', 'leads-to', 'B', true),
		]);
	});

	it('marks hidden curated files in projection', () => {
		const index = buildIndex([node('A'), node('B')], [edge('A', 'B')]);
		const projection = new CuratedProjectionEngine().project(index, {
			files: [{ path: 'A' }, { path: 'B', hidden: true }],
			context: {
				enabled: false,
				depth: 0,
				includeOutgoingLinks: true,
				includeBacklinks: true,
				includeMetadataRelations: true,
			},
		});

		expect(projection.nodes.map((item) => item.id).sort()).toEqual([
			'A',
			'B',
		]);
		expect(projection.edges.map((item) => item.id)).toEqual([
			createEdgeId('A', 'leads-to', 'B', true),
		]);
		expect(projection.primaryIds).toEqual(new Set(['A', 'B']));
		expect(projection.hiddenNodeIds).toEqual(new Set(['B']));
	});
});

function node(id: string, folder = '', domains: string[] = []): KnowledgeNode {
	return {
		id,
		path: id,
		title: id,
		folder,
		domains,
		tags: [],
	};
}

function edge(
	source: string,
	target: string,
	relation: RelationType = 'leads-to',
	directed = true,
): KnowledgeEdge {
	return {
		id: createEdgeId(source, relation, target, directed),
		source,
		target,
		relation,
		directed,
		sourcePath: source,
		sourceField: relation,
	};
}

function buildIndex(
	nodes: KnowledgeNode[],
	edges: KnowledgeEdge[],
): KnowledgeIndex {
	const index = createKnowledgeIndex();
	nodes.forEach((item) => addNode(index, item));
	edges.forEach((item) => addEdge(index, item));
	return index;
}

function query(overrides: Partial<GraphQuery> = {}): GraphQuery {
	return {
		roots: ['A'],
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
		maxNodes: 200,
		showIsolatedNodes: false,
		...overrides,
	};
}

function projectIds(index: KnowledgeIndex, graphQuery: GraphQuery): string[] {
	return new GraphQueryEngine()
		.project(index, graphQuery)
		.nodes.map((item) => item.id)
		.sort();
}
