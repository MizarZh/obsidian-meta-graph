import { describe, expect, it } from 'vitest';
import {
	updateGlobalQueryInState,
	updateQueryInState,
} from '../workspace/workspace-query-state';
import { createWorkspaceState } from '../workspace/workspace-state';

describe('workspace query state', () => {
	it('updates the active chart query and mirrored workspace query', () => {
		const state = createWorkspaceState(100);

		const nextState = updateQueryInState(state, {
			depth: 3,
			tags: ['#project'],
		});

		expect(nextState.query.depth).toBe(3);
		expect(nextState.query.tags).toEqual(['#project']);
		expect(nextState.charts[0]?.query.depth).toBe(3);
		expect(nextState.charts[0]?.query.tags).toEqual(['#project']);
	});

	it('updates global query while keeping roots empty', () => {
		const baseState = createWorkspaceState(100);
		const state = {
			...baseState,
			globalQuery: {
				...baseState.globalQuery,
				roots: ['A.md'],
			},
		};

		const nextState = updateGlobalQueryInState(state, {
			depth: 2,
		});

		expect(nextState.globalQuery.depth).toBe(2);
		expect(nextState.globalQuery.roots).toEqual([]);
	});
});
