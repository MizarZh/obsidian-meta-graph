import { describe, expect, it } from 'vitest';
import type { KnowledgeNode } from '../core/types';
import {
	findDockTemplateLabel,
	findIndexedNodeTitle,
	getDockNoteCandidates,
	getDockNoteEntries,
	getFilePathSuggestions,
	getSelectedDockNodes,
	getWorkspaceNodeColor,
	getWorkspaceNodeColors,
} from '../ui/workspace/derived';
import { createWorkspaceState } from '../workspace/state/workspace-state';

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

	it('builds dock note entries with colors and broken note fallbacks', () => {
		expect(
			getDockNoteEntries(
				snapshot(),
				[
					{ id: 'A.md', path: 'A.md' },
					{ id: 'missing', path: 'folder/Missing.md' },
				],
				new Map([['A.md', '#ff0000']]),
			),
		).toEqual([
			{
				id: 'A.md',
				path: 'A.md',
				title: 'Alpha',
				broken: false,
				color: '#ff0000',
			},
			{
				id: 'missing',
				path: 'folder/Missing.md',
				title: 'Missing',
				broken: true,
			},
		]);
	});

	it('builds node color map from active style defaults', () => {
		const alpha = node('A.md', 'Alpha');
		const colors = getWorkspaceNodeColors(
			[alpha, { ...alpha }],
			createWorkspaceState(200),
			'#fallback',
		);

		expect(colors).toEqual(new Map([['A.md', '#7c6ff0']]));
	});

	it('resolves a single workspace node color from active style defaults', () => {
		expect(
			getWorkspaceNodeColor(node('A.md', 'Alpha'), createWorkspaceState(200), '#fallback'),
		).toBe('#7c6ff0');
	});

	it('finds dock template labels by id', () => {
		expect(
			findDockTemplateLabel(
				[
					template('daily', 'Daily'),
					template('project', 'Project'),
				],
				'project',
			),
		).toBe('Project');
		expect(findDockTemplateLabel([], 'missing')).toBeUndefined();
	});

	it('falls back to node id when indexed title is missing', () => {
		expect(findIndexedNodeTitle(snapshot(), 'A.md')).toBe('Alpha');
		expect(findIndexedNodeTitle(snapshot(), 'Missing.md')).toBe('Missing.md');
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

function template(id: string, label: string) {
	return {
		id,
		label,
		templatePath: `Templates/${label}.md`,
		targetFolder: '',
		relationField: '',
		direction: 'from-dock-to-graph' as const,
	};
}
