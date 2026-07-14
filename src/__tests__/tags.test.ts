import { describe, expect, it } from 'vitest';
import { normalizeTag, normalizeTags } from '../core/tags';
import type { KnowledgeNode } from '../core/types';
import { matchesNodeCriterion } from '../query/filters';
import { DEFAULT_GRAPH_QUERY } from '../query/graph-query';
import { normalizeQuery } from '../workspace/meta-graph/query';

describe('tag normalization', () => {
	it('removes leading hashes and whitespace', () => {
		expect(normalizeTag('  ##TODO  ')).toBe('TODO');
	});

	it('deduplicates frontmatter and inline forms', () => {
		expect(normalizeTags(['#TODO', 'TODO', ' #TODO '])).toEqual(['TODO']);
	});

	it('preserves nested tag paths and case', () => {
		expect(normalizeTags(['#Project/Next', 'project/next'])).toEqual([
			'Project/Next',
			'project/next',
		]);
	});

	it('migrates legacy workspace query tags', () => {
		const query = normalizeQuery(
			{ tags: ['#TODO', 'TODO'] },
			DEFAULT_GRAPH_QUERY,
			200,
		);

		expect(query.tags).toEqual(['TODO']);
	});

	it('matches legacy hash-prefixed filter values', () => {
		const node = { tags: ['TODO'] } as KnowledgeNode;

		expect(matchesNodeCriterion(node, 'file.tags', 'is', '#TODO')).toBe(
			true,
		);
	});
});
