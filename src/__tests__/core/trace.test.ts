import { describe, expect, it } from 'vitest';
import type { GraphProjection } from '@/core/types';
import { traceGraph } from '@/query/trace';

const projection: GraphProjection = {
	nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
		id,
		path: `${id}.md`,
		title: id,
		folder: '',
		tags: [],
		domains: [],
	})),
	edges: [
		['ab', 'a', 'b', true],
		['bc', 'b', 'c', true],
		['ca', 'c', 'a', true],
		['cd', 'c', 'd', false],
		['ae', 'a', 'e', true],
		['eb', 'e', 'b', true],
	].map(([id, source, target, directed]) => ({
		id: String(id),
		source: String(source),
		target: String(target),
		directed: Boolean(directed),
		relation: 'related',
		sourcePath: '',
		sourceField: '',
	})),
	rootIds: new Set(),
};

describe('graph tracing', () => {
	it('filters metadata fields and applies each field direction independently', () => {
		const data = {
			...projection,
			edges: [
				{
					...projection.edges[0]!,
					id: 'ab',
					source: 'a',
					target: 'b',
					sourceField: 'requires',
				},
				{
					...projection.edges[0]!,
					id: 'cb',
					source: 'c',
					target: 'b',
					sourceField: 'leads-to',
				},
				{
					...projection.edges[0]!,
					id: 'dc',
					source: 'd',
					target: 'c',
					sourceField: 'related',
					directed: false,
				},
				{
					...projection.edges[0]!,
					id: 'de',
					source: 'd',
					target: 'e',
					sourceField: 'body',
					kind: 'plain-link' as const,
				},
			],
		};
		const request = {
			mode: 'path' as const,
			source: 'a',
			target: 'd',
			allFields: false,
			fieldRules: [
				{ field: 'requires', direction: 'outgoing' as const },
				{ field: 'leads-to', direction: 'incoming' as const },
				{ field: 'related', direction: 'outgoing' as const },
			],
		};
		expect(traceGraph(data, request).edgeIds).toEqual(
			new Set(['ab', 'cb', 'dc']),
		);
		expect(
			traceGraph(data, {
				...request,
				fieldRules: request.fieldRules.slice(0, 2),
			}).found,
		).toBe(false);
		expect(
			traceGraph(data, {
				...request,
				allFields: true,
				direction: 'both',
				target: 'e',
			}).found,
		).toBe(false);
		expect(traceGraph(data, { ...request, fieldRules: [] }).found).toBe(
			false,
		);
	});
	it('counts overall layers across mixed fields and keeps shortest paths independent of the range limit', () => {
		const request = {
			mode: 'downstream' as const,
			source: 'a',
			direction: 'outgoing' as const,
			allFields: true,
			maxDepth: 1,
		};
		expect(traceGraph(projection, request).nodeIds).toEqual(
			new Set(['a', 'b', 'e']),
		);
		expect(
			traceGraph(projection, { ...request, maxDepth: 2 }).nodeIds,
		).toEqual(new Set(['a', 'b', 'c', 'e']));
		expect(
			traceGraph(projection, { ...request, mode: 'path', target: 'd' })
				.edgeIds,
		).toEqual(new Set(['ab', 'bc', 'cd']));
	});
	it('terminates cycles and excludes undirected links from upstream and downstream', () => {
		for (const mode of ['upstream', 'downstream'] as const) {
			const result = traceGraph(projection, { mode, source: 'b' });
			expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c', 'e']));
			expect(result.edgeIds).toEqual(
				new Set(['ab', 'bc', 'ca', 'ae', 'eb']),
			);
		}
	});
	it('distinguishes incoming and outgoing reachability', () => {
		const chain = { ...projection, edges: projection.edges.slice(0, 2) };
		expect(
			traceGraph(chain, { mode: 'upstream', source: 'b' }).nodeIds,
		).toEqual(new Set(['a', 'b']));
		expect(
			traceGraph(chain, { mode: 'downstream', source: 'b' }).nodeIds,
		).toEqual(new Set(['b', 'c']));
	});
	it('chooses a shortest path and permits undirected links in either direction', () => {
		expect(
			traceGraph(projection, { mode: 'path', source: 'a', target: 'd' })
				.edgeIds,
		).toEqual(new Set(['ab', 'bc', 'cd']));
		expect(
			traceGraph(projection, { mode: 'path', source: 'd', target: 'a' })
				.edgeIds,
		).toEqual(new Set(['cd', 'ca']));
	});
	it('never crosses hidden nodes and handles missing or identical endpoints', () => {
		expect(
			traceGraph(
				{ ...projection, hiddenNodeIds: new Set(['b']) },
				{ mode: 'path', source: 'a', target: 'd' },
			).found,
		).toBe(false);
		expect(
			traceGraph(projection, {
				mode: 'path',
				source: 'a',
				target: 'missing',
			}).found,
		).toBe(false);
		expect(
			traceGraph(projection, { mode: 'path', source: 'a', target: 'a' }),
		).toMatchObject({
			found: true,
			nodeIds: new Set(['a']),
			edgeIds: new Set(),
		});
	});
});
