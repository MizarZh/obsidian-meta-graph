import { describe, expect, it } from 'vitest';
import { createCuratedConditionDraft } from '@/ui/curated/curated-panel-state';

describe('curated panel state', () => {
	it('creates a reusable default condition draft', () => {
		expect(createCuratedConditionDraft()).toEqual({
			mode: 'add',
			resultSearch: '',
			filterRoot: {
				id: 'root',
				kind: 'group',
				mode: 'all',
				children: [],
			},
		});
	});
});
