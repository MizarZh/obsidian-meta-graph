import { describe, expect, it } from 'vitest';
import { addEdge, addNode, createKnowledgeIndex } from '@/core/knowledge-index';
import type { GraphQuery } from '@/core/types';
import { DEFAULT_GRAPH_QUERY } from '@/query/graph-query';
import { GraphQueryEngine } from '@/query/neighborhood';
import { normalizeRelationExpansion } from '@/workspace/meta-graph/query';

function fixture() {
	const index = createKnowledgeIndex();
	for (const id of ['economics', 'math', 'logic', 'history', 'other']) {
		addNode(index, {
			id,
			path: `${id}.md`,
			title: id,
			folder: id === 'logic' ? 'private' : '',
			domains: [],
			tags: id === 'economics' ? ['economics'] : [],
		});
	}
	for (const [source, target, field, directed] of [
		['math', 'economics', 'requires', true],
		['logic', 'math', 'requires', true],
		['economics', 'history', 'related', false],
		['history', 'economics', 'related', false],
		['other', 'other', 'requires', true],
	] as const) {
		addEdge(index, {
			id: `${source}-${target}`,
			source,
			target,
			relation: field,
			sourceField: field,
			sourcePath: `${source}.md`,
			directed,
		});
	}
	const query: GraphQuery = {
		...DEFAULT_GRAPH_QUERY,
		tags: ['economics'],
		relationExpansion: {
			enabled: true,
			allFields: true,
			fields: [],
			depth: 1,
			direction: 'both',
		},
	};
	return { index, query };
}

function ids(query: GraphQuery, globalQuery?: GraphQuery) {
	return new GraphQueryEngine().project(fixture().index, query, globalQuery);
}

describe('relationship expansion', () => {
	it('applies each selected field direction and depth independently, while All uses shared settings', () => {
		const { query } = fixture();
		query.relationExpansion = {
			enabled: true,
			allFields: false,
			fields: ['requires', 'related'],
			direction: 'outgoing',
			depth: 1,
			fieldRules: [
				{ field: 'requires', direction: 'incoming', depth: 2 },
				{ field: 'related', direction: 'outgoing', depth: 1 },
			],
		};
		expect(ids(query).contextIds).toEqual(
			new Set(['math', 'history', 'logic']),
		);
		query.relationExpansion.fieldRules![0]!.depth = 1;
		expect(ids(query).contextIds).toEqual(new Set(['math', 'history']));
		query.relationExpansion.fieldRules![0]!.direction = 'outgoing';
		expect(ids(query).contextIds).toEqual(new Set(['history']));
		query.relationExpansion.fieldRules![0]!.direction = 'incoming';
		query.relationExpansion.allFields = true;
		expect(ids(query).contextIds).toEqual(new Set(['history']));
	});

	it('counts per-field layers from the core across mixed relationship paths', () => {
		const { index, query } = fixture();
		addEdge(index, {
			id: 'math-history',
			source: 'math',
			target: 'history',
			relation: 'related',
			sourceField: 'related',
			sourcePath: 'math.md',
			directed: true,
		});
		index.edges.delete('economics-history');
		index.edges.delete('history-economics');
		query.relationExpansion = {
			enabled: true,
			allFields: false,
			fields: ['requires', 'related'],
			direction: 'both',
			depth: 3,
			fieldRules: [
				{ field: 'requires', direction: 'incoming', depth: 1 },
				{ field: 'related', direction: 'outgoing', depth: 1 },
			],
		};
		const engine = new GraphQueryEngine();
		expect(engine.project(index, query).contextIds).toEqual(
			new Set(['math']),
		);
		query.relationExpansion.fieldRules![1]!.depth = 2;
		expect(engine.project(index, query).contextIds).toEqual(
			new Set(['math', 'history']),
		);
	});

	it('validates field overrides and keeps legacy shared values as fallback', () => {
		expect(
			normalizeRelationExpansion({
				enabled: true,
				allFields: false,
				fields: ['related'],
				direction: 'incoming',
				depth: 2,
				fieldRules: [
					null,
					{ field: 'unused', depth: 3 },
					{ field: ' related ', direction: 'invalid', depth: 99 },
				],
			})?.fieldRules,
		).toEqual([{ field: 'related', direction: 'incoming', depth: 3 }]);
		const { query } = fixture();
		query.relationExpansion!.allFields = false;
		query.relationExpansion!.fields = ['requires'];
		query.relationExpansion!.direction = 'incoming';
		query.relationExpansion!.depth = 2;
		expect(ids(query).contextIds).toEqual(new Set(['math', 'logic']));
	});

	it('uses filtered isolated matches as seeds, adds context, and leaves unrelated nodes out', () => {
		const { query } = fixture();
		const result = ids(query);
		expect(result.nodes.map((node) => node.id).sort()).toEqual([
			'economics',
			'history',
			'math',
		]);
		expect(result.contextIds).toEqual(new Set(['math', 'history']));
		expect(ids({ ...query, relationExpansion: undefined }).nodes).toEqual(
			[],
		);
	});

	it('supports custom fields, incoming traversal, depth, and cycles', () => {
		const { query } = fixture();
		query.relationExpansion = {
			enabled: true,
			allFields: false,
			fields: ['requires'],
			direction: 'incoming',
			depth: 2,
		};
		expect(ids(query).nodes.map((node) => node.id)).toEqual([
			'economics',
			'math',
			'logic',
		]);
		query.relationExpansion.direction = 'outgoing';
		expect(ids(query).nodes).toEqual([]);
		query.relationExpansion.fields = ['related'];
		expect(ids(query).contextIds).toEqual(new Set(['history']));
	});

	it('keeps shared filters as a hard boundary and does not traverse excluded nodes', () => {
		const { query } = fixture();
		query.relationExpansion!.depth = 3;
		const global: GraphQuery = {
			...DEFAULT_GRAPH_QUERY,
			hiddenNodeRules: [
				{
					id: 'hide',
					action: 'hide',
					field: 'file.basename',
					operator: 'is',
					value: 'math',
				},
			],
		};
		expect(
			ids(query, global)
				.nodes.map((node) => node.id)
				.sort(),
		).toEqual(['economics', 'history']);
	});

	it('respects the node limit, empty field selection, and edge filters', () => {
		const { query } = fixture();
		expect(ids({ ...query, maxNodes: 2 }).nodes).toHaveLength(2);
		query.relationExpansion!.allFields = false;
		expect(ids(query).nodes).toEqual([]);
		query.relationExpansion!.allFields = true;
		expect(ids({ ...query, relations: ['related'] }).contextIds).toEqual(
			new Set(['history']),
		);
	});

	it('expands an isolated explicit root', () => {
		const { query } = fixture();
		expect(
			ids({ ...query, roots: ['economics'], depth: 0 }).contextIds,
		).toEqual(new Set(['math', 'history']));
	});

	it('normalizes malformed persisted expansion options', () => {
		expect(normalizeRelationExpansion(undefined)).toBeUndefined();
		expect(
			normalizeRelationExpansion({
				enabled: 'true',
				fields: [' related ', 'related', null],
				depth: 99,
				direction: 'wrong',
			}),
		).toEqual({
			enabled: false,
			allFields: true,
			fields: ['related'],
			depth: 3,
			direction: 'both',
		});
	});
});
