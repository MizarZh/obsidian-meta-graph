import { describe, expect, it } from 'vitest';
import type { KnowledgeNode } from '../core/types';
import {
	getDockNoteCandidates,
	getFilePathSuggestions,
	getSelectedDockNodes,
} from '../ui/workspace-derived';

const nodes = [
	node('B.md', 'beta'),
	node('A.md', 'Alpha'),
	node('Workspace.md', 'Workspace'),
];

describe('workspace derived data', () => {
	it('resolves selected dock notes by path and drops missing notes', () => {
		expect(
			getSelectedDockNodes(snapshot(), [
				{ id: 'A.md', path: 'A.md' },
				{ id: 'Missing.md', path: 'Missing.md' },
			]),
		).toEqual([nodes[1]]);
	});

	it('lists unselected dock candidates excluding workspace file and sorting by title', () => {
		expect(
			getDockNoteCandidates(
				snapshot(),
				[{ id: 'B.md', path: 'B.md' }],
				'Workspace.md',
			),
		).toEqual([nodes[1]]);
	});

	it('sorts file path suggestions case-insensitively', () => {
		expect(getFilePathSuggestions(snapshot())).toEqual([
			'A.md',
			'B.md',
			'Workspace.md',
		]);
	});
});

function snapshot(): { index: { nodes: KnowledgeNode[] } } {
	return { index: { nodes } };
}

function node(path: string, title: string): KnowledgeNode {
	return {
		id: path,
		path,
		title,
		folder: '',
		domains: [],
		tags: [],
	};
}
