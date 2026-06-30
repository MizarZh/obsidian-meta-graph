import { describe, expect, it } from 'vitest';
import type { GraphProjection, KnowledgeIndex } from '../core/types';
import { createWorkspaceDebugSnapshot } from '../workspace/runtime/debug-snapshot';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace debug snapshot', () => {
	it('serializes index maps and projection sets', () => {
		const state = {
			...createWorkspaceState(100),
			projection: createProjection(['A.md']),
		};
		const index = createIndex(['A.md']);

		const snapshot = createWorkspaceDebugSnapshot({
			state,
			index,
			unresolvedLinks: [],
			metadataSources: [],
			rendererDebugState: { status: 'rendered' },
			generatedAt: '2026-01-01T00:00:00.000Z',
		});

		expect(snapshot.generatedAt).toBe('2026-01-01T00:00:00.000Z');
		expect(snapshot.index.nodeCount).toBe(1);
		expect(snapshot.index.outgoing).toEqual({ 'A.md': ['edge-a'] });
		expect(snapshot.state.projection?.rootIds).toEqual(['A.md']);
		expect(snapshot.state.projection?.primaryIds).toEqual(['A.md']);
		expect(snapshot.renderer).toEqual({ status: 'rendered' });
	});
});

function createIndex(ids: string[]): KnowledgeIndex {
	return {
		nodes: new Map(ids.map((id) => [id, node(id)])),
		edges: new Map(),
		outgoing: new Map([['A.md', new Set(['edge-a'])]]),
		incoming: new Map(),
	};
}

function createProjection(ids: string[]): GraphProjection {
	return {
		nodes: ids.map(node),
		edges: [],
		rootIds: new Set(ids),
		primaryIds: new Set(ids),
		contextIds: new Set(),
	};
}

function node(id: string): GraphProjection['nodes'][number] {
	return {
		id,
		path: id,
		title: id.replace(/\.md$/u, ''),
		folder: '',
		domains: [],
		tags: [],
	};
}
