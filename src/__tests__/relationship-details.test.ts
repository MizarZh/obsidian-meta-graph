import { describe, expect, it } from 'vitest';
import type { KnowledgeEdge } from '../core/types';
import { getOtherLinksBetweenNotes } from '../ui/details/relationship-details';

describe('relationship details', () => {
	it('keeps the selected relationship separate from other links for the pair', () => {
		const current = edge('current', 'A.md', 'B.md', 'leads-to');
		const reverse = edge('reverse', 'B.md', 'A.md', 'prerequisite');
		const hidden = edge('hidden', 'A.md', 'B.md', 'related');
		const hiddenPlain = edge('hidden-plain', 'A.md', 'B.md', 'link', {
			kind: 'plain-link',
			semantic: false,
		});
		const unrelated = edge('unrelated', 'A.md', 'C.md', 'related');

		expect(
			getOtherLinksBetweenNotes(
				current,
				[current, hidden, hiddenPlain, unrelated, reverse],
				new Set(['current', 'reverse']),
			).map((candidate) => candidate.id),
		).toEqual(['reverse', 'hidden']);
	});

	it('omits hidden plain links from relationship details', () => {
		const current = edge('current', 'A.md', 'B.md', 'leads-to');
		const hiddenPlain = edge('plain', 'A.md', 'B.md', 'link', {
			kind: 'plain-link',
			semantic: false,
		});
		const visiblePlain = edge('visible-plain', 'B.md', 'A.md', 'link', {
			kind: 'plain-link',
			semantic: false,
		});

		expect(
			getOtherLinksBetweenNotes(
				current,
				[current, hiddenPlain, visiblePlain],
				new Set(['current', 'visible-plain']),
			).map((candidate) => candidate.id),
		).toEqual(['visible-plain']);
	});
});

function edge(
	id: string,
	source: string,
	target: string,
	relation: string,
	patch: Partial<KnowledgeEdge> = {},
): KnowledgeEdge {
	return {
		id,
		source,
		target,
		relation,
		directed: relation !== 'related',
		sourcePath: source,
		sourceField: relation,
		...patch,
	};
}
