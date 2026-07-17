import { describe, expect, it } from 'vitest';
import {
	createPersistenceContextFromV1,
	migrateV1ToV2,
	parsePersistedMetaGraphDocumentV2,
	serializeRuntimeDocumentV2,
	serializeWorkspaceStateV2,
} from '../workspace/meta-graph-v2/codec';
import { createDefaultMetaGraphDocument } from '../workspace/meta-graph-model';
import { createWorkspaceState } from '../workspace/state/workspace-state';
import { updateWorkspaceReferencesInState } from '../workspace/state/reference-walker';
import {
	applyWorkspaceSession,
	createWorkspaceSessionState,
	normalizeWorkspaceSessions,
} from '../workspace/workspace-session';

describe('Meta Graph v2 persistence', () => {
	it('migrates v1 into one canonical v2 representation', () => {
		const v1 = createDefaultMetaGraphDocument(200, 1.5);
		const chart = v1.charts[0];
		if (!chart) throw new Error('Expected default chart.');
		v1.activeChart = chart.id;
		v1.connectionFieldSpecs = [
			{ id: 'leads-to:directed', field: 'leads-to', mode: 'directed' },
			{ id: 'leads-to:reverse', field: 'leads-to', mode: 'reverse' },
		];
		v1.activeConnectionFieldSpecId = 'leads-to:reverse';
		v1.dock.notes = [{ id: 'old-pin-id', path: 'Projects/Index.md' }];
		v1.dock.templates = [
			{
				id: 'concept',
				label: 'Concept',
				templatePath: 'Templates/Concept.md',
				targetFolder: 'Notes',
				defaultGroupId: 'concepts',
			},
		];
		chart.source = 'curated';
		chart.query.folders = ['Projects'];
		chart.query.tags = ['concept'];
		chart.curated.files = [{ path: 'Projects/Index.md', hidden: true }];
		chart.grouping.groups = [
			{
				id: 'concepts',
				name: 'Concepts',
				color: '#7c6ff0',
				mode: 'manual',
				shape: 'rectangle',
				padding: 0.32,
			},
		];
		chart.grouping.overrides = { 'Projects/Index.md': 'concepts' };
		chart.layout.manual = { nodes: {}, groups: [], groupFrames: {} };
		chart.layout.manual.nodes['Projects/Index.md'] = {
			x: 1.23456,
			y: -0.0004,
		};
		chart.layout.manual.groupFrames = {
			concepts: { x: 0, y: 1, width: 4, height: 3 },
		};

		const v2 = migrateV1ToV2(v1, 200, 1.5);
		const savedChart = v2.charts[0];

		expect(v2.defaultChart).toBe(chart.id);
		expect(v2.connections).toEqual({
			default: 'leads-to:reverse',
			fields: [
				{ property: 'leads-to', mode: 'directed' },
				{ property: 'leads-to', mode: 'reverse' },
			],
		});
		expect(v2.resources.pinnedNotes).toEqual(['Projects/Index.md']);
		expect(v2.resources.templates?.[0]).toEqual({
			id: 'concept',
			label: 'Concept',
			template: 'Templates/Concept.md',
			targetFolder: 'Notes',
		});
		expect(savedChart?.content.source).toBe('curated');
		expect(savedChart?.content.query?.filter?.children).toHaveLength(2);
		expect(savedChart?.layout).not.toHaveProperty('engine');
		expect(savedChart?.layout).not.toHaveProperty('positions');
		expect(savedChart?.content).not.toHaveProperty('curated');
		expect(savedChart?.nodes?.['Projects/Index.md']).toEqual({
			curated: true,
			hidden: true,
			x: 1.235,
			y: 0,
			group: 'concepts',
		});
		expect(savedChart).not.toHaveProperty('groupAssignments');
		expect(savedChart?.groups?.[0]?.frame).toEqual({
			x: 0,
			y: 1,
			width: 4,
			height: 3,
		});
		expect(savedChart?.templateOverrides).toEqual({
			concept: { defaultGroup: 'concepts' },
		});
	});

	it('round-trips a normalized v2 document', () => {
		const migrated = migrateV1ToV2(
			createDefaultMetaGraphDocument(200, 1.5),
			200,
			1.5,
		);
		const parsed = parsePersistedMetaGraphDocumentV2(migrated, 200, 1.5);
		const saved = serializeRuntimeDocumentV2(
			parsed.document,
			parsed.persistence,
		);

		expect(migrated.connections).toEqual({});
		expect(migrated.resources).toEqual({});
		expect(migrated.charts[0]).not.toHaveProperty('groups');
		expect(migrated.charts[0]).not.toHaveProperty('style');
		expect(migrated.charts[0]?.layout).toEqual({});
		expect(saved).toEqual(migrated);
	});

	it('migrates unsupported manual group modes to rule groups', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const flow = document.charts.find((chart) => chart.type === 'flow');
		if (!flow) throw new Error('Expected Flow chart.');
		flow.grouping.groups = [
			{
				id: 'legacy-flow-group',
				name: 'Legacy Flow group',
				color: '#7c6ff0',
				mode: 'manual',
				shape: 'auto',
				padding: 0.32,
			},
		];

		const migrated = migrateV1ToV2(document, 200, 1.5);
		const savedFlow = migrated.charts.find(
			(chart) => chart.type === 'flow',
		);

		expect(savedFlow?.groups?.[0]).toMatchObject({
			id: 'legacy-flow-group',
			mode: 'rule',
			rule: { kind: 'group', mode: 'all', children: [] },
		});
	});

	it('keeps personal session changes out of the shared document', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const context = createPersistenceContextFromV1(document);
		const state = createWorkspaceState(200, 1.5, document);
		const before = serializeWorkspaceStateV2(state, context);
		const activeChart = state.charts[0];
		if (!activeChart) throw new Error('Expected active chart.');
		const after = serializeWorkspaceStateV2(
			{
				...state,
				activeChartId: state.charts[1]?.id ?? state.activeChartId,
				activeConnectionField: 'personal-field',
				activeConnectionFieldSpecId: 'personal-field:reverse',
				dock: {
					...state.dock,
					dockWidth: 999,
					curatedPanelWidth: 777,
					focusOnSelect: false,
				},
				charts: state.charts.map((chart) =>
					chart.id === activeChart.id
						? {
								...chart,
								presentation: {
									...chart.presentation,
									dockWidth: 999,
									showFilters: false,
								},
								display: {
									...chart.display,
									showFilters: false,
								},
							}
						: chart,
				),
			},
			context,
		);

		expect(after).toEqual(before);
	});

	it('merges curated placements when serializing workspace state', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const chart = document.charts[0];
		if (!chart) throw new Error('Expected active chart.');
		chart.source = 'curated';
		chart.curated.files = [{ path: 'Curated/Placed.md', hidden: true }];
		chart.layout.manual = {
			nodes: { 'Curated/Placed.md': { x: 2.34567, y: -1.23456 } },
			groups: [],
			groupFrames: {},
		};
		const context = createPersistenceContextFromV1(document);
		const state = createWorkspaceState(200, 1.5, document);

		const saved = serializeWorkspaceStateV2(state, context);

		expect(saved.charts[0]?.nodes).toEqual({
			'Curated/Placed.md': {
				curated: true,
				hidden: true,
				x: 2.346,
				y: -1.235,
			},
		});
		expect(saved.charts[0]?.layout).not.toHaveProperty('positions');
	});

	it('applies per-chart local session state without changing shared defaults', () => {
		const migrated = migrateV1ToV2(
			createDefaultMetaGraphDocument(200, 1.5),
			200,
			1.5,
		);
		const parsed = parsePersistedMetaGraphDocumentV2(migrated, 200, 1.5);
		const targetChart = parsed.document.charts[1];
		if (!targetChart) throw new Error('Expected a second chart.');
		const sessionDocument = applyWorkspaceSession(
			parsed.document,
			parsed.persistence,
			{
				activeChart: targetChart.id,
				charts: {
					[targetChart.id]: {
						showFilters: false,
						dockWidth: 444,
						focusOnSelect: false,
					},
				},
			},
		);
		const state = createWorkspaceState(200, 1.5, sessionDocument);

		expect(state.activeChartId).toBe(targetChart.id);
		expect(state.dock.dockWidth).toBe(444);
		expect(state.dock.focusOnSelect).toBe(false);
		const savedSession = createWorkspaceSessionState(state, {
			rightPanelTab: 'templates',
			dockOpen: false,
			curatedPanelOpen: true,
			connectionOpen: false,
		});
		expect(savedSession.charts?.[targetChart.id]).toMatchObject({
			showFilters: false,
			dockWidth: 444,
			focusOnSelect: false,
		});
		expect(savedSession.shell).toEqual({
			rightPanelTab: 'templates',
			dockOpen: false,
			curatedPanelOpen: true,
			connectionOpen: false,
		});
		expect(serializeWorkspaceStateV2(state, parsed.persistence)).toEqual(
			migrated,
		);
	});

	it('preserves curated and query configurations across source switches', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const chart = document.charts[0];
		if (!chart) throw new Error('Expected default chart.');
		chart.query.roots = ['Query/Root.md'];
		chart.query.depth = 4;
		chart.curated.files = [{ path: 'Curated/Note.md', hidden: true }];
		chart.layout.manual = {
			nodes: { 'Query/Result.md': { x: 0.42, y: -1.08 } },
			groups: [],
			groupFrames: {},
		};
		chart.source = 'curated';
		const context = createPersistenceContextFromV1(document);

		const curated = serializeRuntimeDocumentV2(document, context);
		chart.source = 'query';
		const query = serializeRuntimeDocumentV2(document, context);

		expect(curated.charts[0]?.content).toMatchObject({
			source: 'curated',
			query: { roots: ['Query/Root.md'], traversal: { depth: 4 } },
		});
		expect(curated.charts[0]?.nodes).toEqual({
			'Curated/Note.md': { curated: true, hidden: true },
			'Query/Result.md': { x: 0.42, y: -1.08 },
		});
		expect(query.charts[0]?.content).toMatchObject({
			source: 'query',
			query: { roots: ['Query/Root.md'], traversal: { depth: 4 } },
		});
		expect(query.charts[0]?.nodes).toEqual(curated.charts[0]?.nodes);
	});

	it('round-trips query positions and cube face assignments through nodes', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const chart = document.charts[0];
		if (!chart) throw new Error('Expected default chart.');
		chart.type = 'cube';
		chart.source = 'query';
		chart.layout.engine = 'cube-3d';
		chart.layout.manual = {
			nodes: {
				'Query/Cube.md': {
					x: 1.25,
					y: -0.5,
					groupId: 'cube-front',
				},
			},
			groups: [
				{
					id: 'cube-front',
					name: 'Front',
					color: '#7c6ff0',
					mode: 'manual',
					shape: 'rectangle',
					padding: 0.32,
					x: -1,
					y: -1,
					width: 2,
					height: 2,
				},
			],
			groupFrames: {},
		};
		const context = createPersistenceContextFromV1(document);

		const saved = serializeRuntimeDocumentV2(document, context);
		const persistedChart = saved.charts[0];
		expect(persistedChart?.nodes).toEqual({
			'Query/Cube.md': { x: 1.25, y: -0.5, group: 'cube-front' },
		});
		expect(persistedChart?.groups?.[0]).not.toHaveProperty('mode');
		const parsed = parsePersistedMetaGraphDocumentV2(saved, 200, 1.5);
		expect(
			parsed.document.charts[0]?.layout.manual?.nodes['Query/Cube.md'],
		).toEqual({ x: 1.25, y: -0.5, groupId: 'cube-front' });
		expect(
			serializeRuntimeDocumentV2(parsed.document, parsed.persistence),
		).toEqual(saved);
	});

	it('normalizes local session data independently from the shared document', () => {
		expect(
			normalizeWorkspaceSessions({
				'path:Graph.md': {
					activeChart: 42,
					charts: {
						map: {
							dockWidth: 900,
							curatedPanelWidth: 'bad',
							focusOnSelect: false,
						},
					},
					shell: {
						rightPanelTab: 'unknown',
						dockOpen: false,
					},
				},
			}),
		).toEqual({
			'path:Graph.md': {
				charts: {
					map: { dockWidth: 520, focusOnSelect: false },
				},
				shell: { dockOpen: false },
			},
		});
	});

	it('opens compatible future documents read-only', () => {
		const v2 = migrateV1ToV2(
			createDefaultMetaGraphDocument(200, 1.5),
			200,
			1.5,
		);
		const chart = v2.charts[0];
		if (!chart) throw new Error('Expected default chart.');
		const future = {
			...v2,
			charts: [
				{
					...chart,
					layout: { ...chart.layout, futureLayoutOption: true },
				},
			],
		};
		const parsed = parsePersistedMetaGraphDocumentV2(future, 200, 1.5, {
			sourceVersion: 3,
			readOnly: true,
		});

		expect(parsed.persistence.sourceVersion).toBe(3);
		expect(parsed.persistence.readOnly).toBe(true);
		expect(() =>
			parsePersistedMetaGraphDocumentV2(future, 200, 1.5),
		).toThrow('futureLayoutOption is invalid');
	});

	it('rejects invalid v2 references', () => {
		const v2 = migrateV1ToV2(
			createDefaultMetaGraphDocument(200, 1.5),
			200,
			1.5,
		);

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{ ...v2, defaultChart: 'missing' },
				200,
				1.5,
			),
		).toThrow('defaultChart does not exist');

		const chart = v2.charts[0];
		if (!chart) throw new Error('Expected default chart.');
		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							templateOverrides: {
								missing: { defaultGroup: 'missing' },
							},
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('references a missing template');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					connections: {
						fields: [{ property: 'leads-to', mode: 'sideways' }],
					},
				},
				200,
				1.5,
			),
		).toThrow('has an invalid mode');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							nodes: { 'Note.md': { x: 1 } },
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('must define x and y together');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							nodes: { 'Note.md': { group: 'missing' } },
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('group references a missing group');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							content: {
								...chart.content,
								curated: { notes: [{ path: 'Old.md' }] },
							},
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('content.curated is invalid');

		const manualGroup = {
			id: 'manual-group',
			name: 'Manual group',
			color: '#7c6ff0',
			mode: 'manual',
			shape: 'auto',
			padding: 0.32,
		};
		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							type: 'flow',
							groups: [manualGroup],
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('mode must be rule for flow');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							type: 'cube',
							groups: [{ ...manualGroup, id: 'cube-front' }],
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('mode is invalid for Cube system groups');

		expect(() =>
			parsePersistedMetaGraphDocumentV2(
				{
					...v2,
					charts: [
						{
							...chart,
							type: 'arc',
							nodes: {
								'Note.md': { group: 'rule-group' },
							},
							groups: [
								{
									...manualGroup,
									id: 'rule-group',
									mode: 'rule',
								},
							],
						},
					],
				},
				200,
				1.5,
			),
		).toThrow('group is invalid for arc');
	});

	it('renames every typed file reference together', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const chart = document.charts[0];
		if (!chart) throw new Error('Expected graph chart.');
		chart.layout.manual = { nodes: {}, groups: [], groupFrames: {} };
		document.activeChart = chart.id;
		document.dock.notes = [{ id: 'pin', path: 'Old/Note.md' }];
		document.dock.templates = [
			{
				id: 'template',
				label: 'Template',
				templatePath: 'Old/Template.md',
				targetFolder: 'Old',
			},
		];
		chart.query.roots = ['Old/Note.md'];
		chart.query.filterRoot = {
			id: 'root',
			kind: 'group',
			mode: 'all',
			children: [
				{
					id: 'path',
					kind: 'condition',
					field: 'file.path',
					operator: 'is',
					value: 'Old/Note.md',
				},
			],
		};
		chart.curated.files = [{ path: 'Old/Note.md' }];
		chart.layout.manual.nodes = { 'Old/Note.md': { x: 1, y: 2 } };
		chart.grouping.overrides = { 'Old/Note.md': null };
		const state = createWorkspaceState(200, 1.5, document);

		const result = updateWorkspaceReferencesInState(state, 'Old', 'New');
		const updated = result.state.charts[0];

		expect(result.changed).toBe(true);
		expect(updated?.query.roots).toEqual(['New/Note.md']);
		expect(updated?.query.filterRoot?.children[0]).toMatchObject({
			value: 'New/Note.md',
		});
		expect(updated?.curated.files[0]?.path).toBe('New/Note.md');
		expect(updated?.layout.manual?.nodes).toHaveProperty('New/Note.md');
		expect(updated?.grouping.overrides).toHaveProperty('New/Note.md');
		expect(result.state.dock.notes[0]?.path).toBe('New/Note.md');
		expect(result.state.dock.templates[0]).toMatchObject({
			templatePath: 'New/Template.md',
			targetFolder: 'New',
		});
		const saved = serializeWorkspaceStateV2(
			result.state,
			createPersistenceContextFromV1(document),
		);
		expect(saved.charts[0]?.nodes).toHaveProperty('New/Note.md');
		expect(saved.charts[0]?.nodes).not.toHaveProperty('Old/Note.md');
	});
});
