import { describe, expect, it } from 'vitest';
import type { GraphProjection, KnowledgeIndex } from '../core/types';
import {
	applyWorkspaceIndexSnapshotToState,
	applyWorkspaceProjectionToState,
	projectWorkspaceState,
} from '../workspace/runtime/refresh-state';
import { addCuratedFileInState } from '../workspace/actions/curated-actions';
import { setActiveChartTypeInState } from '../workspace/state/chart-state';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace refresh state', () => {
	it('applies index metadata and prunes missing curated files', () => {
		const state = addCuratedFileInState(
			createWorkspaceState(100),
			'Missing.md',
		).state;
		const index = createIndex(['Existing.md']);

		const nextState = applyWorkspaceIndexSnapshotToState(
			state,
			{
				index,
				unresolvedLinks: [],
				metadataSources: [],
				availableFolders: ['Folder'],
				availableTags: ['tag'],
				availableDomains: ['domain'],
			},
			true,
		);

		expect(nextState.curated.files).toEqual([]);
		expect(nextState.layoutRevision).toBe(state.layoutRevision + 1);
		expect(nextState.availableFolders).toEqual(['Folder']);
		expect(nextState.availableTags).toEqual(['tag']);
		expect(nextState.availableDomains).toEqual(['domain']);
	});

	it('drops selection when projected nodes no longer contain it', () => {
		const state = {
			...createWorkspaceState(100),
			selectedNodeId: 'Missing.md',
		};

		const nextState = applyWorkspaceProjectionToState(
			state,
			createProjection(['Existing.md']),
		);

		expect(nextState.selectedNodeId).toBeUndefined();
		expect(nextState.projection?.nodes.map((node) => node.id)).toEqual([
			'Existing.md',
		]);
	});

	it('projects state through a supplied projector', () => {
		const state = createWorkspaceState(100);
		const index = createIndex(['A.md']);

		const nextState = projectWorkspaceState(state, index, () =>
			createProjection(['A.md']),
		);

		expect(nextState.projection?.nodes[0]?.id).toBe('A.md');
	});

	it('normalizes cube layout for projected nodes', () => {
		const cubeState = setActiveChartTypeInState(
			createWorkspaceState(100),
			'cube',
		).state;

		const nextState = applyWorkspaceProjectionToState(
			cubeState,
			createProjection(['A.md']),
		);

		expect(nextState.manualLayout.nodes['A.md']?.groupId).toBeTruthy();
		expect(nextState.layoutRevision).toBe(cubeState.layoutRevision + 1);
	});
});

function createIndex(ids: string[]): KnowledgeIndex {
	return {
		nodes: new Map(ids.map((id) => [id, node(id)])),
		edges: new Map(),
		outgoing: new Map(),
		incoming: new Map(),
	};
}

function createProjection(ids: string[]): GraphProjection {
	return {
		nodes: ids.map(node),
		edges: [],
		rootIds: new Set(ids),
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
