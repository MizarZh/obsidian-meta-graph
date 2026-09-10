import { describe, expect, it } from 'vitest';
import type { GraphProjection, KnowledgeNode } from '@/core/types';
import {
	buildQueryNodeListEntries,
	filterNodeListEntries,
	retainNodeListSelection,
} from '@/ui/nodes/node-list-state';
import { buildSelectedCuratedFiles } from '@/ui/curated/curated-panel-state';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

function node(id: string, path = id): KnowledgeNode {
	return { id, path, title: path, folder: '', domains: [], tags: [] };
}

describe('shared node list sources', () => {
	it('filters by node ID locally, combines search, and restores all rows when cleared', () => {
		const state = createWorkspaceState(100);
		const nodes = [
			node('A.md'),
			{
				...node('__unresolved__/B', 'B'),
				tags: ['topic'],
				aliases: ['Alias'],
			},
		];
		const projection: GraphProjection = {
			nodes,
			edges: [],
			rootIds: new Set(),
		};
		const rows = buildQueryNodeListEntries(
			projection,
			state.manualLayout,
			new Map(),
			new Map(),
		);
		const index = new Map(nodes.map((item) => [item.id, item]));
		const filterRoot = {
			id: 'root',
			kind: 'group',
			mode: 'all',
			children: [
				{
					id: 'tag',
					kind: 'condition',
					field: 'tag',
					operator: 'has-tag',
					value: 'topic',
				},
			],
		} as const;
		const filter = { ...filterRoot, children: [...filterRoot.children] };
		expect(filterNodeListEntries(rows, 'alias', index, filter)).toEqual([
			rows[1],
		]);
		expect(filterNodeListEntries(rows, 'A.md', index, filter)).toEqual([]);
		expect(
			filterNodeListEntries(rows, '', index, { ...filter, children: [] }),
		).toEqual(rows);
		expect(projection.nodes).toBe(nodes);
		expect(rows).toHaveLength(2);
	});

	it('uses only the final query projection and preserves unresolved node IDs', () => {
		const state = createWorkspaceState(200);
		const projection: GraphProjection = {
			nodes: [
				node('A.md'),
				{ ...node('__unresolved__/B', 'B'), kind: 'unresolved' },
			],
			edges: [],
			rootIds: new Set(),
		};
		const entries = buildQueryNodeListEntries(
			projection,
			state.manualLayout,
			new Map(),
			new Map(),
		);
		expect(entries.map((entry) => entry.id)).toEqual([
			'A.md',
			'__unresolved__/B',
		]);
		expect(entries[1]).toMatchObject({
			path: 'B',
			unresolved: true,
			missing: false,
		});
		expect(projection.nodes).toHaveLength(2);
		expect(
			buildQueryNodeListEntries(
				undefined,
				state.manualLayout,
				new Map(),
				new Map(),
			),
		).toEqual([]);
	});

	it('keeps curated hidden and missing members in their persisted order', () => {
		const state = createWorkspaceState(200);
		const curated = {
			...state.curated,
			files: [{ path: 'Missing.md' }, { path: 'A.md', hidden: true }],
		};
		const entries = buildSelectedCuratedFiles(
			curated,
			new Map([['A.md', node('A.md')]]),
			state.manualLayout,
			new Map(),
			new Map(),
		);
		expect(entries.map((entry) => entry.id)).toEqual([
			'Missing.md',
			'A.md',
		]);
		expect(entries[0]).toMatchObject({ missing: true, hidden: false });
		expect(entries[1]).toMatchObject({ missing: false, hidden: true });
	});

	it('uses canonical group overrides, including explicit ungrouped results', () => {
		const state = createWorkspaceState(200);
		const projection: GraphProjection = {
			nodes: [node('A.md')],
			edges: [],
			rootIds: new Set(),
		};
		const manualLayout = {
			...state.manualLayout,
			nodes: { 'A.md': { x: 0, y: 0, groupId: 'old' } },
		};
		const entries = buildQueryNodeListEntries(
			projection,
			manualLayout,
			new Map(),
			new Map([['A.md', '#123456']]),
			new Map([['A.md', undefined]]),
		);
		expect(entries[0]).toMatchObject({
			groupId: '',
			groupName: 'No group',
			color: '#123456',
		});
	});

	it('prunes departed result IDs without allocating for unchanged selection', () => {
		const selected = new Set(['A.md', '__unresolved__/B']);
		expect(
			retainNodeListSelection(
				selected,
				new Set(['A.md', '__unresolved__/B', 'C.md']),
			),
		).toBe(selected);
		const retained = retainNodeListSelection(selected, new Set(['A.md']));
		expect([...retained]).toEqual(['A.md']);
		expect(selected.size).toBe(2);
		expect(retainNodeListSelection(retained, new Set()).size).toBe(0);
	});
});
