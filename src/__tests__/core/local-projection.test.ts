import { describe, expect, it, vi } from 'vitest';
import {
	addEdge,
	addNode,
	createKnowledgeIndex,
	removeEdge,
} from '@/core/knowledge-index';
import type {
	KnowledgeEdge,
	KnowledgeIndex,
	CuratedWorkspaceConfig,
} from '@/core/types';
import { CuratedProjectionEngine } from '@/query/curated';
import { GraphQueryEngine } from '@/query/neighborhood';
import { DEFAULT_GRAPH_QUERY } from '@/query/graph-query';

function edge(
	id: string,
	source: string,
	target: string,
	patch: Partial<KnowledgeEdge> = {},
): KnowledgeEdge {
	return {
		id,
		source,
		target,
		directed: true,
		relation: 'related',
		sourcePath: source,
		sourceField: 'related',
		...patch,
	};
}

function fixture() {
	const index = createKnowledgeIndex();
	for (const id of ['A', 'B', 'C', 'Missing'])
		addNode(index, {
			id,
			path: id,
			title: id,
			folder: '',
			tags: [],
			domains: [],
			kind: id === 'Missing' ? 'unresolved' : 'note',
		});
	const edges = [
		edge('reverse', 'B', 'A'),
		edge('undirected', 'C', 'A', { directed: false }),
		edge('forward', 'A', 'B'),
		edge('loop', 'A', 'A'),
		edge('plain', 'A', 'B', { kind: 'plain-link', semantic: false }),
		edge('missing', 'A', 'Missing', {
			kind: 'unresolved-link',
			semantic: false,
		}),
		edge('parallel', 'A', 'B'),
	];
	edges.forEach((item) => addEdge(index, item));
	return index;
}

function curated(ids: string[]): CuratedWorkspaceConfig {
	return {
		files: ids.map((path) => ({ path })),
		context: {
			enabled: false,
			depth: 0,
			includeOutgoingLinks: true,
			includeBacklinks: true,
			includeMetadataRelations: true,
		},
	};
}

describe('local graph projections', () => {
	it.each(['incoming', 'outgoing', 'both'] as const)(
		'preserves induced edges and insertion order for %s traversal',
		(direction) => {
			const index = fixture();
			const result = new GraphQueryEngine().project(index, {
				...DEFAULT_GRAPH_QUERY,
				roots: ['A'],
				direction,
				depth: 1,
			});
			const expected = [...index.edges.values()].filter(
				(item) => item.kind === undefined,
			);
			expect(result.edges).toEqual(expected);
			expect(result.nodes.map((node) => node.id)).toEqual([
				'B',
				'A',
				'C',
			]);
			expect(result.rootIds).toEqual(new Set(['A']));
		},
	);

	it('preserves limits and filters while collecting edges', () => {
		const index = fixture();
		const result = new GraphQueryEngine().project(index, {
			...DEFAULT_GRAPH_QUERY,
			roots: ['A'],
			maxNodes: 2,
			direction: 'outgoing',
		});
		expect(result.nodes.map((node) => node.id)).toEqual(['B', 'A']);
		expect(result.edges.map((item) => item.id)).toEqual([
			'reverse',
			'forward',
			'loop',
			'parallel',
		]);
		const filtered = new GraphQueryEngine().project(index, {
			...DEFAULT_GRAPH_QUERY,
			roots: ['A'],
			relations: ['other'],
		});
		expect(filtered.edges).toEqual([]);
	});

	it('preserves curated order, hidden nodes, and unresolved context', () => {
		const index = fixture();
		const selection = curated(['A', 'B']);
		selection.files[0]!.hidden = true;
		const result = new CuratedProjectionEngine().project(index, selection, {
			showPlainLinks: true,
			showUnresolvedLinks: true,
		});
		expect(result.edges).toEqual(
			[...index.edges.values()].filter((item) => item.source !== 'C'),
		);
		expect(result.nodes.map((node) => node.id)).toEqual([
			'A',
			'B',
			'Missing',
		]);
		expect(result.hiddenNodeIds).toEqual(new Set(['A']));
		expect(result.contextIds).toEqual(new Set(['Missing']));
	});

	it('keeps Map insertion order after duplicate insertion and remove/reinsert', () => {
		const index = fixture();
		const first = index.edges.get('reverse')!;
		addEdge(index, first);
		removeEdge(index, first.id);
		addEdge(index, first);
		const result = new CuratedProjectionEngine().project(
			index,
			curated(['A', 'B', 'C', 'Missing']),
			{ showPlainLinks: true, showUnresolvedLinks: true },
		);
		expect(result.edges).toEqual([...index.edges.values()]);
		expect(result.edges.at(-1)).toBe(first);
	});

	it.each(['neighborhood', 'curated'] as const)(
		'%s does not scan unrelated vault edges',
		(kind) => {
			const index = fixture();
			for (let i = 0; i < 2000; i++)
				addEdge(index, edge(`unrelated-${i}`, `X${i}`, `Y${i}`));
			const rejectScan = () => {
				throw new Error('Unexpected full edge scan');
			};
			vi.spyOn(index.edges, 'values').mockImplementation(rejectScan);
			vi.spyOn(index.edges, 'keys').mockImplementation(rejectScan);
			vi.spyOn(index.edges, 'entries').mockImplementation(rejectScan);
			vi.spyOn(index.edges, 'forEach').mockImplementation(rejectScan);
			vi.spyOn(index.edges, Symbol.iterator).mockImplementation(
				rejectScan,
			);
			const get = vi.spyOn(index.edges, 'get');
			const result =
				kind === 'neighborhood'
					? new GraphQueryEngine().project(index, {
							...DEFAULT_GRAPH_QUERY,
							roots: ['A'],
							depth: 1,
						})
					: new CuratedProjectionEngine().project(
							index,
							curated(['A', 'B', 'C']),
						);
			expect(result.edges).toHaveLength(5);
			expect(
				get.mock.calls.every(([id]) => !id.startsWith('unrelated-')),
			).toBe(true);
			expect(get.mock.calls.length).toBeLessThan(40);
		},
	);

	it('supports externally constructed indexes', () => {
		const original = fixture();
		const index: KnowledgeIndex = {
			nodes: original.nodes,
			edges: new Map(original.edges),
			incoming: original.incoming,
			outgoing: original.outgoing,
		};
		const result = new CuratedProjectionEngine().project(
			index,
			curated(['A', 'B', 'C', 'Missing']),
			{ showPlainLinks: true, showUnresolvedLinks: true },
		);
		expect(result.edges).toEqual([...index.edges.values()]);
	});
});
