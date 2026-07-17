import type {
	ChartLayoutConfig,
	ConnectionFieldMode,
	ConnectionFieldSpec,
	GraphQuery,
	MetaGraphChart,
	MetaGraphDocument,
	NodeFilterGroup,
	NodeFilterItem,
	WorkspaceState,
} from '../../core/types';
import { cloneSerializable } from '../state/persistence';
import {
	DEFAULT_CUBE_FACE_OPACITY,
	DEFAULT_CUBE_FREE_CAMERA,
	DEFAULT_CUBE_SIZE,
	DEFAULT_FORCE_LABELS,
	DEFAULT_GRAPH_CENTER_FORCE,
	DEFAULT_GRAPH_DRAG_LINK_FORCE,
	DEFAULT_GRAPH_LINK_DISTANCE,
	DEFAULT_GRAPH_LINK_FORCE,
	DEFAULT_GRAPH_REPEL_FORCE,
	DEFAULT_GRAPH_RETURN_FORCE,
	DEFAULT_LABEL_BACKGROUND_OPACITY,
	DEFAULT_LABEL_BOLD,
	DEFAULT_LABEL_COLOR,
	DEFAULT_LABEL_DARK_BACKGROUND_COLOR,
	DEFAULT_LABEL_DARK_BACKGROUND_OPACITY,
	DEFAULT_LABEL_DARK_TEXT_COLOR,
	DEFAULT_LABEL_DENSITY,
	DEFAULT_LABEL_ITALIC,
	DEFAULT_LABEL_LIGHT_BACKGROUND_COLOR,
	DEFAULT_LABEL_LIGHT_BACKGROUND_OPACITY,
	DEFAULT_LABEL_LIGHT_TEXT_COLOR,
	DEFAULT_LABEL_OFFSET,
	DEFAULT_LABEL_POSITION,
	DEFAULT_LABEL_SIZE,
	DEFAULT_THREE_LABEL_RESOLUTION,
} from '../meta-graph/constants';
import {
	createDefaultMetaGraphDocument,
	normalizeMetaGraphDocument,
	serializeMetaGraphState,
} from '../meta-graph/document';
import { normalizeFilterRoot } from '../meta-graph/query';
import {
	isRecord,
	normalizeTextPath,
	uniqueStrings,
} from '../meta-graph/utils';
import type {
	ParsedMetaGraphWorkspace,
	PersistedChartContentV2,
	PersistedChartNodeV2,
	PersistedChartV2,
	PersistedConnectionsV2,
	PersistedDisplayV2,
	PersistedGroupV2,
	PersistedMetaGraphDocumentV2,
	PersistedPresentationV2,
	PersistedResourcesV2,
	PersistedTemplateOverrideV2,
	WorkspacePersistenceContext,
} from './types';

const LEGACY_FILTER_GROUP_IDS = {
	folders: 'v1-folders',
	tags: 'v1-tags',
	domains: 'v1-domains',
} as const;

const V2_DEFAULT_MAX_NODES = 500;

const V2_CUBE_GROUP_IDS = new Set([
	'cube-front',
	'cube-back',
	'cube-left',
	'cube-right',
	'cube-top',
	'cube-bottom',
]);

export function createDefaultMetaGraphDocumentV2(
	maxNodes: number,
	fadeDistance: number,
): PersistedMetaGraphDocumentV2 {
	const document = createDefaultMetaGraphDocument(maxNodes, fadeDistance);
	return serializeRuntimeDocumentV2(
		document,
		createPersistenceContextFromV1(document),
	);
}

export function migrateV1ToV2(
	value: unknown,
	maxNodes: number,
	fadeDistance: number,
): PersistedMetaGraphDocumentV2 {
	const document = normalizeMetaGraphDocument(value, maxNodes, fadeDistance);
	const context = createPersistenceContextFromV1(document);
	for (const chart of document.charts) {
		chart.templateOverrides = Object.fromEntries(
			Object.entries(
				context.templateOverridesByChart[chart.id] ?? {},
			).map(([templateId, override]) => [
				templateId,
				{ defaultGroupId: override.defaultGroup },
			]),
		);
	}
	return serializeRuntimeDocumentV2(document, context);
}

export function parsePersistedMetaGraphDocumentV2(
	value: unknown,
	_maxNodes: number,
	fadeDistance: number,
	options: { sourceVersion?: number; readOnly?: boolean } = {},
): ParsedMetaGraphWorkspace {
	if (!isRecord(value)) {
		throw new Error('Meta Graph v2 document body must be a YAML object.');
	}
	const shared = isRecord(value.shared) ? value.shared : {};
	const sharedFilters = isRecord(shared.filters) ? shared.filters : {};
	const sharedStyle = isRecord(shared.style) ? shared.style : {};
	const connections = normalizeConnections(
		value.connections,
		options.readOnly === true,
	);
	const resources = normalizeResources(value.resources);
	validateUniqueTemplateIds(resources);
	const rawCharts = Array.isArray(value.charts) ? value.charts : [];
	if (rawCharts.length === 0) {
		throw new Error(
			'Meta Graph v2 document must contain at least one chart.',
		);
	}
	const charts = rawCharts.map((chart, index) =>
		v2ChartToLegacyRecord(
			chart,
			index,
			fadeDistance,
			options.readOnly === true,
		),
	);
	const chartIds = new Set(
		charts.flatMap((chart) =>
			typeof chart.id === 'string' ? [chart.id] : [],
		),
	);
	if (chartIds.size !== charts.length) {
		throw new Error('Meta Graph v2 chart IDs must be unique.');
	}
	for (const [index, rawChart] of rawCharts.entries()) {
		validateChartReferences(
			rawChart,
			index,
			resources,
			options.readOnly === true,
		);
	}
	const defaultChart = readRequiredString(value.defaultChart, 'defaultChart');
	if (!chartIds.has(defaultChart)) {
		throw new Error(
			`Meta Graph defaultChart does not exist: ${defaultChart}`,
		);
	}
	if (
		connections.default &&
		!connections.fields.some(
			(field) =>
				connectionSpecId(field.property, field.mode) ===
				connections.default,
		)
	) {
		throw new Error(
			`Meta Graph default connection does not exist: ${connections.default}`,
		);
	}

	const defaultPresentation = createDefaultPresentation();
	const presentationByChart: Record<string, PersistedPresentationV2> = {};
	const templateOverridesByChart: Record<
		string,
		Record<string, PersistedTemplateOverrideV2>
	> = {};
	const chartExtensions: Record<string, Record<string, unknown>> = {};
	for (const [index, rawChart] of rawCharts.entries()) {
		const chart = isRecord(rawChart) ? rawChart : {};
		const chartId =
			typeof charts[index]?.id === 'string' ? charts[index].id : '';
		presentationByChart[chartId] = normalizePresentation(
			chart.presentation,
			defaultPresentation,
		);
		templateOverridesByChart[chartId] = normalizeTemplateOverrides(
			chart.templateOverrides,
		);
		if (isRecord(chart.extensions)) {
			chartExtensions[chartId] = cloneSerializable(chart.extensions);
		}
	}
	const activePresentation =
		presentationByChart[defaultChart] ?? defaultPresentation;
	const legacyRecord = {
		globalQuery: {
			roots: [],
			folders: [],
			tags: [],
			hiddenNodeRules: [],
			filterRoot: normalizeFilterRoot(sharedFilters.nodes, []),
			domains: [],
			relations: readStringArray(sharedFilters.relations),
			depth: 1,
			direction: 'both',
			maxNodes: V2_DEFAULT_MAX_NODES,
			showIsolatedNodes: true,
			showPlainLinks: false,
			showUnresolvedLinks: false,
		},
		globalStyle: {
			defaultNodeStyle: isRecord(sharedStyle.node)
				? sharedStyle.node
				: {},
			defaultLinkStyle: isRecord(sharedStyle.link)
				? sharedStyle.link
				: {},
			nodeRules: Array.isArray(sharedStyle.nodeRules)
				? sharedStyle.nodeRules
				: [],
			linkRules: Array.isArray(sharedStyle.linkRules)
				? sharedStyle.linkRules
				: [],
		},
		charts,
		activeChart: defaultChart,
		connectionFields: uniqueStrings(
			connections.fields.map((field) => field.property),
		),
		connectionFieldSpecs: connections.fields.map((field) => ({
			id: connectionSpecId(field.property, field.mode),
			field: field.property,
			mode: field.mode,
		})),
		connectionFieldModes: Object.fromEntries(
			connections.fields.map((field) => [field.property, field.mode]),
		),
		activeConnectionFieldSpecId: connections.default,
		activeConnectionField:
			connections.fields.find(
				(field) =>
					connectionSpecId(field.property, field.mode) ===
					connections.default,
			)?.property ?? '',
		dock: {
			notes: resources.pinnedNotes.map((path, index) => ({
				id: `note-${index + 1}`,
				path,
			})),
			templates: resources.templates.map((template) => ({
				id: template.id,
				label: template.label,
				templatePath: template.template,
				targetFolder: template.targetFolder,
				defaultGroupId:
					templateOverridesByChart[defaultChart]?.[template.id]
						?.defaultGroup,
			})),
			dockWidth: activePresentation.widths.dock,
			curatedPanelWidth: activePresentation.widths.curated,
			focusOnSelect: activePresentation.focusOnSelect,
		},
	};
	const document = normalizeMetaGraphDocument(
		legacyRecord,
		V2_DEFAULT_MAX_NODES,
		fadeDistance,
	);
	return {
		document,
		persistence: {
			defaultChart,
			defaultConnection: connections.default,
			presentationByChart,
			templateOverridesByChart,
			extensions: isRecord(value.extensions)
				? cloneSerializable(value.extensions)
				: undefined,
			chartExtensions,
			sourceVersion: options.sourceVersion ?? 2,
			readOnly: options.readOnly === true,
		},
	};
}

export function serializeWorkspaceStateV2(
	state: WorkspaceState,
	context: WorkspacePersistenceContext,
): PersistedMetaGraphDocumentV2 {
	return serializeRuntimeDocumentV2(serializeMetaGraphState(state), context);
}

export function serializeRuntimeDocumentV2(
	document: MetaGraphDocument,
	context: WorkspacePersistenceContext,
): PersistedMetaGraphDocumentV2 {
	const defaultChart = document.charts.some(
		(chart) => chart.id === context.defaultChart,
	)
		? context.defaultChart
		: (document.charts[0]?.id ?? 'knowledge-map');
	const specs = normalizeRuntimeConnectionSpecs(document);
	const defaultConnection = specs.some(
		(spec) => spec.id === context.defaultConnection,
	)
		? context.defaultConnection
		: (specs[0]?.id ?? '');
	return {
		defaultChart,
		shared: {
			filters: {
				nodes: queryFilterToV2(document.globalQuery, 'shared-root'),
				relations: [...document.globalQuery.relations],
			},
			style: {
				node: cloneSerializable(document.globalStyle.defaultNodeStyle),
				link: cloneSerializable(document.globalStyle.defaultLinkStyle),
				nodeRules: cloneSerializable(document.globalStyle.nodeRules),
				linkRules: cloneSerializable(document.globalStyle.linkRules),
			},
		},
		connections: {
			...(defaultConnection ? { default: defaultConnection } : {}),
			...(specs.length > 0
				? {
						fields: specs.map((spec) => ({
							property: spec.field,
							mode: spec.mode,
						})),
					}
				: {}),
		},
		resources: {
			...(document.dock.notes.length > 0
				? {
						pinnedNotes: document.dock.notes.map((note) =>
							normalizeTextPath(note.path),
						),
					}
				: {}),
			...(document.dock.templates.length > 0
				? {
						templates: document.dock.templates.map((template) => ({
							id: template.id,
							label: template.label,
							template: normalizeTextPath(template.templatePath),
							targetFolder: normalizeTextPath(
								template.targetFolder,
							),
						})),
					}
				: {}),
		},
		charts: document.charts.map((chart) => chartToV2(chart, context)),
		...(context.extensions
			? { extensions: cloneSerializable(context.extensions) }
			: {}),
	};
}

export function createPersistenceContextFromV1(
	document: MetaGraphDocument,
): WorkspacePersistenceContext {
	const templateOverridesByChart: WorkspacePersistenceContext['templateOverridesByChart'] =
		{};
	const presentationByChart: WorkspacePersistenceContext['presentationByChart'] =
		{};
	const chartExtensions: NonNullable<
		WorkspacePersistenceContext['chartExtensions']
	> = {};
	for (const chart of document.charts) {
		presentationByChart[chart.id] = {
			panels: {
				filters: chart.display.showFilters,
				inspector: chart.display.showInspector,
			},
			widths: {
				dock: document.dock.dockWidth,
				curated: document.dock.curatedPanelWidth,
			},
			focusOnSelect: document.dock.focusOnSelect,
		};
		const groupIds = new Set(
			chart.grouping.groups.map((group) => group.id),
		);
		templateOverridesByChart[chart.id] = Object.fromEntries(
			document.dock.templates.flatMap((template) =>
				template.defaultGroupId && groupIds.has(template.defaultGroupId)
					? [[template.id, { defaultGroup: template.defaultGroupId }]]
					: [],
			),
		);
		if (
			chart.curated.context.enabled ||
			chart.curated.context.depth !== 1 ||
			!chart.curated.context.includeOutgoingLinks ||
			!chart.curated.context.includeBacklinks ||
			!chart.curated.context.includeMetadataRelations
		) {
			chartExtensions[chart.id] = {
				'meta-graph.legacyContext': cloneSerializable(
					chart.curated.context,
				),
			};
		}
	}
	const defaultConnection =
		document.activeConnectionFieldSpecId ||
		normalizeRuntimeConnectionSpecs(document)[0]?.id ||
		'';
	return {
		defaultChart:
			document.activeChart || document.charts[0]?.id || 'knowledge-map',
		defaultConnection,
		presentationByChart,
		templateOverridesByChart,
		chartExtensions,
		sourceVersion: 1,
		readOnly: false,
	};
}

export function connectionSpecId(
	property: string,
	mode: ConnectionFieldSpec['mode'],
): string {
	return `${property.trim()}:${mode}`;
}

function chartToV2(
	chart: MetaGraphChart,
	context: WorkspacePersistenceContext,
): PersistedChartV2 {
	const groups = readPersistedGroups(chart);
	const nodes = nodesToV2(chart);
	const templateOverrides = Object.fromEntries(
		Object.entries(chart.templateOverrides).map(
			([templateId, override]) => [
				templateId,
				{ defaultGroup: override.defaultGroupId },
			],
		),
	);
	const style = chartStyleToV2(chart);
	return {
		id: chart.id,
		name: chart.name,
		type: chart.type,
		content: contentToV2(chart),
		...(Object.keys(nodes).length > 0 ? { nodes } : {}),
		layout: layoutToV2(chart.layout, chart.type),
		...(groups.length > 0 ? { groups } : {}),
		display: displayToV2(chart),
		presentation:
			context.presentationByChart[chart.id] ??
			createPresentationFromChart(chart),
		...(Object.keys(templateOverrides).length > 0
			? { templateOverrides }
			: {}),
		...(Object.keys(style).length > 0 ? { style } : {}),
		...(context.chartExtensions?.[chart.id]
			? {
					extensions: cloneSerializable(
						context.chartExtensions[chart.id],
					),
				}
			: {}),
	};
}

function contentToV2(chart: MetaGraphChart): PersistedChartContentV2 {
	const defaults = createV2DefaultQuery(chart.type);
	const query: NonNullable<PersistedChartContentV2['query']> = {};
	const roots = chart.query.roots.map(normalizeTextPath);
	if (roots.length > 0) query.roots = roots;
	const traversal: NonNullable<
		NonNullable<PersistedChartContentV2['query']>['traversal']
	> = {};
	if (chart.query.depth !== defaults.depth)
		traversal.depth = chart.query.depth;
	if (chart.query.direction !== defaults.direction) {
		traversal.direction = chart.query.direction;
	}
	if (Object.keys(traversal).length > 0) query.traversal = traversal;
	if (!valuesEqual(chart.query.relations, defaults.relations)) {
		query.relations = [...chart.query.relations];
	}
	if (chart.query.maxNodes !== defaults.maxNodes) {
		query.limit = chart.query.maxNodes;
	}
	if (chart.query.showIsolatedNodes !== defaults.showIsolatedNodes) {
		query.includeIsolated = chart.query.showIsolatedNodes;
	}
	const filter = queryFilterToV2(chart.query, 'query-root');
	if (filter.mode !== 'all' || filter.children.length > 0)
		query.filter = filter;
	return {
		source: chart.source,
		...(chart.query.showPlainLinks || chart.query.showUnresolvedLinks
			? {
					links: {
						plain: chart.query.showPlainLinks,
						unresolved: chart.query.showUnresolvedLinks,
					},
				}
			: {}),
		...(Object.keys(query).length > 0 ? { query } : {}),
	};
}

interface PersistedNodeDraft {
	curated?: true;
	hidden?: true;
	note?: string;
	x?: number;
	y?: number;
	group?: string | null;
	hasGroup?: boolean;
}

function nodesToV2(
	chart: MetaGraphChart,
): Record<string, PersistedChartNodeV2> {
	const drafts = new Map<string, PersistedNodeDraft>();
	const readDraft = (path: string): PersistedNodeDraft => {
		const normalizedPath = normalizeTextPath(path);
		const existing = drafts.get(normalizedPath);
		if (existing) return existing;
		const draft: PersistedNodeDraft = {};
		drafts.set(normalizedPath, draft);
		return draft;
	};

	for (const file of chart.curated.files) {
		const draft = readDraft(file.path);
		draft.curated = true;
		if (file.hidden) draft.hidden = true;
		if (file.note) draft.note = file.note;
		if (
			typeof file.x === 'number' &&
			Number.isFinite(file.x) &&
			typeof file.y === 'number' &&
			Number.isFinite(file.y)
		) {
			draft.x = roundCoordinate(file.x);
			draft.y = roundCoordinate(file.y);
		}
		if (
			(chart.type === 'graph' ||
				chart.type === 'free' ||
				chart.type === 'cube') &&
			file.groupId
		) {
			draft.group = file.groupId;
			draft.hasGroup = true;
		}
	}

	for (const [path, placement] of Object.entries(
		chart.layout.manual?.nodes ?? {},
	)) {
		const draft = readDraft(path);
		draft.x = roundCoordinate(placement.x);
		draft.y = roundCoordinate(placement.y);
		if (chart.type === 'cube' && placement.groupId) {
			draft.group = placement.groupId;
			draft.hasGroup = true;
		}
	}

	if (chart.type === 'graph' || chart.type === 'free') {
		for (const [path, groupId] of Object.entries(
			chart.grouping.overrides,
		)) {
			const draft = readDraft(path);
			draft.group = groupId;
			draft.hasGroup = true;
		}
	}

	return Object.fromEntries(
		[...drafts.entries()]
			.filter(([path]) => Boolean(path))
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([path, draft]) => [
				path,
				{
					...(draft.curated ? { curated: true as const } : {}),
					...(draft.hidden ? { hidden: true as const } : {}),
					...(draft.note ? { note: draft.note } : {}),
					...(draft.x !== undefined && draft.y !== undefined
						? { x: draft.x, y: draft.y }
						: {}),
					...(draft.hasGroup ? { group: draft.group ?? null } : {}),
				},
			]),
	);
}

function layoutToV2(
	layout: ChartLayoutConfig,
	type: MetaGraphChart['type'],
): PersistedChartV2['layout'] {
	const base = {
		...(layout.spacing !== 1 ? { spacing: layout.spacing } : {}),
	};
	if (type === 'graph' || type === 'graph-3d' || type === 'cube') {
		const forces = compactDefined({
			center:
				layout.centerForce !== DEFAULT_GRAPH_CENTER_FORCE
					? layout.centerForce
					: undefined,
			repel:
				layout.repelForce !== DEFAULT_GRAPH_REPEL_FORCE
					? layout.repelForce
					: undefined,
			link:
				layout.linkForce !== DEFAULT_GRAPH_LINK_FORCE
					? layout.linkForce
					: undefined,
			dragLink:
				layout.dragLinkForce !== DEFAULT_GRAPH_DRAG_LINK_FORCE
					? layout.dragLinkForce
					: undefined,
			return:
				layout.returnForce !== DEFAULT_GRAPH_RETURN_FORCE
					? layout.returnForce
					: undefined,
			linkDistance:
				layout.linkDistance !== DEFAULT_GRAPH_LINK_DISTANCE
					? layout.linkDistance
					: undefined,
		});
		return {
			...base,
			...(Object.keys(forces).length > 0 ? { forces } : {}),
		};
	}
	if (type === 'flow') {
		return {
			...base,
			...(typeof layout.layerSpacing === 'number' &&
			layout.layerSpacing !== 1
				? { layerSpacing: layout.layerSpacing }
				: {}),
			...(typeof layout.laneSpacing === 'number' &&
			layout.laneSpacing !== 1
				? { laneSpacing: layout.laneSpacing }
				: {}),
			...(layout.direction && layout.direction !== 'LR'
				? { direction: layout.direction }
				: {}),
			...(layout.flowRelationRules?.length
				? {
						flowRelationRules: cloneSerializable(
							layout.flowRelationRules,
						),
					}
				: {}),
			...(layout.edgeStyle && layout.edgeStyle !== 'orthogonal'
				? { edgeStyle: layout.edgeStyle }
				: {}),
		};
	}
	if (type === 'arc') {
		return {
			...base,
			...(layout.arcDirection && layout.arcDirection !== 'right'
				? { arcDirection: layout.arcDirection }
				: {}),
			...(layout.arcLabelAngle && layout.arcLabelAngle !== 'auto'
				? { arcLabelAngle: layout.arcLabelAngle }
				: {}),
			...(layout.nodeSort && layout.nodeSort !== 'name'
				? { nodeSort: layout.nodeSort }
				: {}),
			...(layout.nodeSortDirection && layout.nodeSortDirection !== 'asc'
				? { nodeSortDirection: layout.nodeSortDirection }
				: {}),
		};
	}
	if (type === 'hierarchical-edge-bundling') {
		return {
			...base,
			...(layout.nodeSort && layout.nodeSort !== 'path'
				? { nodeSort: layout.nodeSort }
				: {}),
			...(layout.nodeSortDirection && layout.nodeSortDirection !== 'asc'
				? { nodeSortDirection: layout.nodeSortDirection }
				: {}),
		};
	}
	return base;
}

function readPersistedGroups(chart: MetaGraphChart): PersistedGroupV2[] {
	const manual = chart.layout.manual;
	if (chart.type === 'cube' && manual?.groups.length) {
		return manual.groups.map((group) =>
			groupToV2(
				chart.grouping.groups.find(
					(definition) => definition.id === group.id,
				) ?? group,
				group,
				chart.type,
			),
		);
	}
	return chart.grouping.groups
		.filter(
			(group) =>
				chart.type === 'graph' ||
				chart.type === 'free' ||
				((chart.type === 'flow' ||
					chart.type === 'arc' ||
					chart.type === 'hierarchical-edge-bundling') &&
					group.mode === 'rule'),
		)
		.map((group) =>
			groupToV2(group, manual?.groupFrames?.[group.id], chart.type),
		);
}

function groupToV2(
	group: MetaGraphChart['grouping']['groups'][number],
	frame?: { x: number; y: number; width: number; height: number },
	type?: MetaGraphChart['type'],
): PersistedGroupV2 {
	return {
		id: group.id,
		name: group.name,
		color: group.color,
		...(type === 'cube' ? {} : { mode: group.mode }),
		shape: group.shape ?? 'auto',
		padding: group.padding,
		...(group.rule ? { rule: cloneSerializable(group.rule) } : {}),
		...(frame
			? {
					frame: {
						x: roundCoordinate(frame.x),
						y: roundCoordinate(frame.y),
						width: roundCoordinate(frame.width),
						height: roundCoordinate(frame.height),
					},
				}
			: {}),
	};
}

function displayToV2(chart: MetaGraphChart): PersistedDisplayV2 {
	const display = chart.display;
	const labels: NonNullable<PersistedDisplayV2['labels']> = compactDefined({
		size:
			display.labelSize !== DEFAULT_LABEL_SIZE
				? display.labelSize
				: undefined,
		threeResolution:
			display.threeLabelResolution !== DEFAULT_THREE_LABEL_RESOLUTION
				? display.threeLabelResolution
				: undefined,
		bold:
			display.labelBold !== DEFAULT_LABEL_BOLD
				? display.labelBold
				: undefined,
		italic:
			display.labelItalic !== DEFAULT_LABEL_ITALIC
				? display.labelItalic
				: undefined,
		position:
			display.labelPosition !== DEFAULT_LABEL_POSITION
				? display.labelPosition
				: undefined,
		offset:
			display.labelOffset !== DEFAULT_LABEL_OFFSET
				? display.labelOffset
				: undefined,
		color:
			display.labelColor !== DEFAULT_LABEL_COLOR
				? display.labelColor
				: undefined,
		lightTextColor:
			display.labelLightTextColor !== DEFAULT_LABEL_LIGHT_TEXT_COLOR
				? display.labelLightTextColor
				: undefined,
		lightBackgroundColor:
			display.labelLightBackgroundColor !==
			DEFAULT_LABEL_LIGHT_BACKGROUND_COLOR
				? display.labelLightBackgroundColor
				: undefined,
		lightBackgroundOpacity:
			display.labelLightBackgroundOpacity !==
			DEFAULT_LABEL_LIGHT_BACKGROUND_OPACITY
				? display.labelLightBackgroundOpacity
				: undefined,
		darkTextColor:
			display.labelDarkTextColor !== DEFAULT_LABEL_DARK_TEXT_COLOR
				? display.labelDarkTextColor
				: undefined,
		darkBackgroundColor:
			display.labelDarkBackgroundColor !==
			DEFAULT_LABEL_DARK_BACKGROUND_COLOR
				? display.labelDarkBackgroundColor
				: undefined,
		darkBackgroundOpacity:
			display.labelDarkBackgroundOpacity !==
			DEFAULT_LABEL_DARK_BACKGROUND_OPACITY
				? display.labelDarkBackgroundOpacity
				: undefined,
		backgroundOpacity:
			display.labelBackgroundOpacity !== DEFAULT_LABEL_BACKGROUND_OPACITY
				? display.labelBackgroundOpacity
				: undefined,
		density:
			display.labelDensity !== DEFAULT_LABEL_DENSITY
				? display.labelDensity
				: undefined,
		force:
			display.forceLabels !== DEFAULT_FORCE_LABELS
				? display.forceLabels
				: undefined,
	});
	const cube = compactDefined({
		faceOpacity:
			display.cubeFaceOpacity !== DEFAULT_CUBE_FACE_OPACITY
				? display.cubeFaceOpacity
				: undefined,
		size:
			display.cubeSize !== DEFAULT_CUBE_SIZE
				? display.cubeSize
				: undefined,
		freeCamera:
			display.cubeFreeCamera !== DEFAULT_CUBE_FREE_CAMERA
				? display.cubeFreeCamera
				: undefined,
	});
	return {
		fadeDistance: display.fadeDistance,
		...(Object.keys(labels).length > 0 ? { labels } : {}),
		...(chart.type === 'cube' && Object.keys(cube).length > 0
			? { cube }
			: {}),
		...(chart.type === 'graph' || chart.type === 'graph-3d'
			? display.enableForceLayout
				? { forceLayout: true }
				: {}
			: {}),
	};
}

function chartStyleToV2(
	chart: MetaGraphChart,
): NonNullable<PersistedChartV2['style']> {
	return {
		...(Object.keys(chart.style.nodeOverrides).length > 0
			? { node: cloneSerializable(chart.style.nodeOverrides) }
			: {}),
		...(Object.keys(chart.style.unresolvedNodeOverrides).length > 0
			? {
					unresolvedNode: cloneSerializable(
						chart.style.unresolvedNodeOverrides,
					),
				}
			: {}),
		...(Object.keys(chart.style.linkOverrides).length > 0
			? { link: cloneSerializable(chart.style.linkOverrides) }
			: {}),
		...(Object.keys(chart.style.plainLinkOverrides).length > 0
			? { plainLink: cloneSerializable(chart.style.plainLinkOverrides) }
			: {}),
		...(Object.keys(chart.style.unresolvedLinkOverrides).length > 0
			? {
					unresolvedLink: cloneSerializable(
						chart.style.unresolvedLinkOverrides,
					),
				}
			: {}),
		...(chart.style.nodeRules.length > 0
			? { nodeRules: cloneSerializable(chart.style.nodeRules) }
			: {}),
		...(chart.style.linkRules.length > 0
			? { linkRules: cloneSerializable(chart.style.linkRules) }
			: {}),
	};
}

function queryFilterToV2(query: GraphQuery, rootId: string): NodeFilterGroup {
	const base = cloneSerializable(
		query.filterRoot ??
			normalizeFilterRoot(undefined, query.hiddenNodeRules),
	);
	const legacyGroups: NodeFilterItem[] = [];
	if (query.folders.length > 0) {
		legacyGroups.push(
			createAnyFilterGroup(
				LEGACY_FILTER_GROUP_IDS.folders,
				'file.folder',
				'in-folder',
				query.folders,
			),
		);
	}
	if (query.tags.length > 0) {
		legacyGroups.push(
			createAnyFilterGroup(
				LEGACY_FILTER_GROUP_IDS.tags,
				'file.tags',
				'has-tag',
				query.tags,
			),
		);
	}
	if (query.domains.length > 0) {
		legacyGroups.push(
			createAnyFilterGroup(
				LEGACY_FILTER_GROUP_IDS.domains,
				'metadata.domains',
				'contains',
				query.domains,
			),
		);
	}
	return {
		id: rootId,
		kind: 'group',
		mode: 'all',
		children: [...legacyGroups, ...base.children],
	};
}

function createAnyFilterGroup(
	id: string,
	field: 'file.folder' | 'file.tags' | 'metadata.domains',
	operator: 'in-folder' | 'has-tag' | 'contains',
	values: string[],
): NodeFilterGroup {
	return {
		id,
		kind: 'group',
		mode: 'any',
		children: values.map((value, index) => ({
			id: `${id}-${index + 1}`,
			kind: 'condition',
			field,
			operator,
			value,
		})),
	};
}

function normalizeRuntimeConnectionSpecs(
	document: MetaGraphDocument,
): ConnectionFieldSpec[] {
	const source =
		document.connectionFieldSpecs.length > 0
			? document.connectionFieldSpecs
			: document.connectionFields.map((field) => ({
					id: connectionSpecId(
						field,
						document.connectionFieldModes[field] ?? 'directed',
					),
					field,
					mode: document.connectionFieldModes[field] ?? 'directed',
				}));
	const seen = new Set<string>();
	return source.flatMap((spec) => {
		const id = connectionSpecId(spec.field, spec.mode);
		if (!spec.field.trim() || seen.has(id)) {
			return [];
		}
		seen.add(id);
		return [{ ...spec, id }];
	});
}

function v2ChartToLegacyRecord(
	value: unknown,
	index: number,
	fadeDistance: number,
	allowUnknownLayoutFields: boolean,
): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`Meta Graph charts[${index}] must be a YAML object.`);
	}
	const id = readRequiredString(value.id, `charts[${index}].id`);
	const name = readRequiredString(value.name, `charts[${index}].name`);
	const type = readChartType(value.type, `charts[${index}].type`);
	if (!allowUnknownLayoutFields) {
		validateRecordFields(
			value,
			[
				'id',
				'name',
				'type',
				'content',
				'nodes',
				'layout',
				'groups',
				'display',
				'presentation',
				'templateOverrides',
				'style',
				'extensions',
			],
			`charts[${index}]`,
		);
	}
	const content = isRecord(value.content) ? value.content : {};
	if (!allowUnknownLayoutFields) {
		validateRecordFields(
			content,
			['source', 'links', 'query'],
			`charts[${index}].content`,
		);
	}
	if (content.source !== 'query' && content.source !== 'curated') {
		throw new Error(
			`Meta Graph v2 charts[${index}].content.source must be query or curated.`,
		);
	}
	const links = isRecord(content.links) ? content.links : {};
	const query = isRecord(content.query) ? content.query : {};
	const traversal = isRecord(query.traversal) ? query.traversal : {};
	const nodes = normalizePersistedNodes(
		value.nodes,
		index,
		type,
		allowUnknownLayoutFields,
	);
	const layout = isRecord(value.layout) ? value.layout : {};
	if (!allowUnknownLayoutFields) {
		validateLayoutFields(layout, type, index);
	}
	const forces = isRecord(layout.forces) ? layout.forces : {};
	const display = isRecord(value.display) ? value.display : {};
	const labels = isRecord(display.labels) ? display.labels : {};
	const cube = isRecord(display.cube) ? display.cube : {};
	const style = isRecord(value.style) ? value.style : {};
	const presentation = normalizePresentation(
		value.presentation,
		createDefaultPresentation(),
	);
	const templateOverrides = normalizeTemplateOverrides(
		value.templateOverrides,
	);
	const groups = normalizeGroups(value.groups);
	const groupFrames = Object.fromEntries(
		groups.flatMap((group) =>
			group.frame ? [[group.id, group.frame]] : [],
		),
	);
	const positions = Object.fromEntries(
		Object.entries(nodes).flatMap(([path, node]) =>
			node.x !== undefined && node.y !== undefined
				? ([
						[
							path,
							{
								x: node.x,
								y: node.y,
								...(type === 'cube' &&
								typeof node.group === 'string'
									? { groupId: node.group }
									: {}),
							},
						],
					] as const)
				: [],
		),
	);
	const manualGroups =
		type === 'cube'
			? groups.map((group) => ({
					...group,
					x: group.frame?.x ?? 0,
					y: group.frame?.y ?? 0,
					width: group.frame?.width ?? 2,
					height: group.frame?.height ?? 2,
				}))
			: [];
	const legacyQuery = {
		...createV2DefaultQuery(type),
		...(Array.isArray(query.roots)
			? { roots: readStringArray(query.roots) }
			: {}),
		...(isRecord(query.filter)
			? { filterRoot: normalizeFilterRoot(query.filter, []) }
			: {}),
		...(Array.isArray(query.relations)
			? { relations: readStringArray(query.relations) }
			: {}),
		...(typeof traversal.depth === 'number'
			? { depth: traversal.depth }
			: {}),
		...(typeof traversal.direction === 'string'
			? { direction: traversal.direction }
			: {}),
		...(typeof query.limit === 'number' ? { maxNodes: query.limit } : {}),
		...(typeof query.includeIsolated === 'boolean'
			? { showIsolatedNodes: query.includeIsolated }
			: {}),
		...(typeof links.plain === 'boolean'
			? { showPlainLinks: links.plain }
			: {}),
		...(typeof links.unresolved === 'boolean'
			? { showUnresolvedLinks: links.unresolved }
			: {}),
	};
	return {
		id,
		name,
		type,
		source: content.source,
		query: legacyQuery,
		curated: {
			files: Object.entries(nodes).flatMap(([path, node]) =>
				node.curated
					? [
							{
								path,
								...(node.note ? { note: node.note } : {}),
								...(node.hidden ? { hidden: true } : {}),
							},
						]
					: [],
			),
		},
		grouping: {
			groups: groups.map(({ frame: _frame, ...group }) => group),
			overrides:
				type === 'cube'
					? {}
					: Object.fromEntries(
							Object.entries(nodes).flatMap(([path, node]) =>
								Object.prototype.hasOwnProperty.call(
									node,
									'group',
								)
									? [[path, node.group ?? null]]
									: [],
							),
						),
		},
		layout: {
			engine: layoutEngineForType(type),
			spacing: layout.spacing,
			centerForce: forces.center,
			repelForce: forces.repel,
			linkForce: forces.link,
			dragLinkForce: forces.dragLink,
			returnForce: forces.return,
			linkDistance: forces.linkDistance,
			layerSpacing: layout.layerSpacing,
			laneSpacing: layout.laneSpacing,
			direction: layout.direction,
			flowRelationRules: layout.flowRelationRules,
			edgeStyle: layout.edgeStyle,
			arcDirection: layout.arcDirection,
			arcLabelAngle: layout.arcLabelAngle,
			nodeSort: layout.nodeSort,
			nodeSortDirection: layout.nodeSortDirection,
			manual: {
				nodes: positions,
				groups: manualGroups,
				groupFrames,
			},
		},
		display: {
			fadeDistance: display.fadeDistance ?? fadeDistance,
			labelSize: labels.size,
			threeLabelResolution: labels.threeResolution,
			labelBold: labels.bold,
			labelItalic: labels.italic,
			labelPosition: labels.position,
			labelOffset: labels.offset,
			labelColor: labels.color,
			labelLightTextColor: labels.lightTextColor,
			labelLightBackgroundColor: labels.lightBackgroundColor,
			labelLightBackgroundOpacity: labels.lightBackgroundOpacity,
			labelDarkTextColor: labels.darkTextColor,
			labelDarkBackgroundColor: labels.darkBackgroundColor,
			labelDarkBackgroundOpacity: labels.darkBackgroundOpacity,
			labelBackgroundOpacity: labels.backgroundOpacity,
			labelDensity: labels.density,
			forceLabels: labels.force,
			cubeFaceOpacity: cube.faceOpacity,
			cubeSize: cube.size,
			cubeFreeCamera: cube.freeCamera,
			enableForceLayout: display.forceLayout,
			showInspector: presentation.panels.inspector,
			showFilters: presentation.panels.filters,
		},
		presentation: {
			showInspector: presentation.panels.inspector,
			showFilters: presentation.panels.filters,
			dockWidth: presentation.widths.dock,
			curatedPanelWidth: presentation.widths.curated,
			focusOnSelect: presentation.focusOnSelect,
		},
		templateOverrides: Object.fromEntries(
			Object.entries(templateOverrides).map(([templateId, override]) => [
				templateId,
				{ defaultGroupId: override.defaultGroup },
			]),
		),
		style: {
			nodeOverrides: style.node,
			unresolvedNodeOverrides: style.unresolvedNode,
			linkOverrides: style.link,
			plainLinkOverrides: style.plainLink,
			unresolvedLinkOverrides: style.unresolvedLink,
			nodeRules: style.nodeRules,
			linkRules: style.linkRules,
		},
	};
}

function normalizeConnections(
	value: unknown,
	allowUnknownModes: boolean,
): Required<PersistedConnectionsV2> {
	const record = isRecord(value) ? value : {};
	const fields: Array<{ property: string; mode: ConnectionFieldMode }> =
		Array.isArray(record.fields)
			? record.fields.flatMap((field) => {
					if (!isRecord(field)) {
						throw new Error(
							'Meta Graph v2 connection fields must be YAML objects.',
						);
					}
					const item = field;
					const property =
						typeof item.property === 'string'
							? item.property.trim()
							: '';
					if (!property) {
						throw new Error(
							'Meta Graph v2 connection field property must be a non-empty string.',
						);
					}
					if (
						item.mode !== 'directed' &&
						item.mode !== 'bidirectional' &&
						item.mode !== 'reverse' &&
						!allowUnknownModes
					) {
						throw new Error(
							`Meta Graph v2 connection field ${property} has an invalid mode.`,
						);
					}
					const mode: ConnectionFieldMode =
						item.mode === 'bidirectional' || item.mode === 'reverse'
							? item.mode
							: 'directed';
					return [{ property, mode }];
				})
			: [];
	const seen = new Set<string>();
	const uniqueFields = fields.filter((field) => {
		const id = connectionSpecId(field.property, field.mode);
		if (seen.has(id)) {
			throw new Error(`Meta Graph v2 connection is duplicated: ${id}`);
		}
		seen.add(id);
		return true;
	});
	return {
		default:
			typeof record.default === 'string'
				? record.default.trim()
				: uniqueFields[0]
					? connectionSpecId(
							uniqueFields[0].property,
							uniqueFields[0].mode,
						)
					: '',
		fields: uniqueFields,
	};
}

function normalizeResources(value: unknown): Required<PersistedResourcesV2> {
	const record = isRecord(value) ? value : {};
	const pinnedNotes = uniqueStrings(
		readStringArray(record.pinnedNotes)
			.map(normalizeTextPath)
			.filter(Boolean),
	);
	const templates = Array.isArray(record.templates)
		? record.templates.flatMap((template, index) => {
				if (!isRecord(template)) {
					throw new Error(
						`Meta Graph v2 resources.templates[${index}] must be a YAML object.`,
					);
				}
				const item = template;
				const id = readRequiredString(
					item.id,
					`resources.templates[${index}].id`,
				);
				const label =
					typeof item.label === 'string' ? item.label.trim() : '';
				if (!label) {
					throw new Error(
						`Meta Graph v2 resources.templates[${index}].label must be a non-empty string.`,
					);
				}
				const templatePath =
					typeof item.template === 'string'
						? normalizeTextPath(item.template)
						: '';
				return [
					{
						id,
						label,
						template: templatePath,
						targetFolder:
							typeof item.targetFolder === 'string'
								? normalizeTextPath(item.targetFolder)
								: '',
					},
				];
			})
		: [];
	return { pinnedNotes, templates };
}

function normalizeGroups(value: unknown): Array<PersistedGroupV2> {
	return Array.isArray(value)
		? value.flatMap((group, index) => {
				if (!isRecord(group)) {
					throw new Error(
						`Meta Graph v2 groups[${index}] must be a YAML object.`,
					);
				}
				const item = group;
				const id = readRequiredString(item.id, `groups[${index}].id`);
				const name = readRequiredString(
					item.name,
					`groups[${index}].name`,
				);
				const frame = isRecord(item.frame)
					? {
							x: readNumber(item.frame.x, 0),
							y: readNumber(item.frame.y, 0),
							width: readNumber(item.frame.width, 3.2),
							height: readNumber(item.frame.height, 2.2),
						}
					: undefined;
				return [
					{
						id,
						name,
						color:
							typeof item.color === 'string' && item.color.trim()
								? item.color.trim()
								: '#7c6ff0',
						mode: item.mode === 'rule' ? 'rule' : 'manual',
						shape:
							item.shape === 'circle' ||
							item.shape === 'rectangle'
								? item.shape
								: 'auto',
						padding: Math.max(0, readNumber(item.padding, 0.32)),
						...(isRecord(item.rule)
							? { rule: normalizeFilterRoot(item.rule, []) }
							: {}),
						...(frame ? { frame } : {}),
					},
				];
			})
		: [];
}

function normalizePersistedNodes(
	value: unknown,
	chartIndex: number,
	type: MetaGraphChart['type'],
	allowUnknownFields: boolean,
): Record<string, PersistedChartNodeV2> {
	if (value === undefined) return {};
	if (!isRecord(value)) {
		throw new Error(
			`Meta Graph v2 charts[${chartIndex}].nodes must be a YAML object.`,
		);
	}
	const result: Record<string, PersistedChartNodeV2> = {};
	const allowedFields = new Set([
		'curated',
		'hidden',
		'note',
		'x',
		'y',
		'group',
	]);
	for (const [rawPath, rawNode] of Object.entries(value)) {
		const path = normalizeTextPath(rawPath);
		if (!path) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes contains an empty path.`,
			);
		}
		if (Object.prototype.hasOwnProperty.call(result, path)) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes contains a duplicate normalized path: ${path}`,
			);
		}
		if (!isRecord(rawNode)) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}] must be a YAML object.`,
			);
		}
		if (!allowUnknownFields) {
			const invalid = Object.keys(rawNode).find(
				(field) => !allowedFields.has(field),
			);
			if (invalid) {
				throw new Error(
					`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].${invalid} is invalid.`,
				);
			}
		}
		if (
			rawNode.curated !== undefined &&
			typeof rawNode.curated !== 'boolean'
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].curated must be boolean.`,
			);
		}
		if (
			rawNode.hidden !== undefined &&
			typeof rawNode.hidden !== 'boolean'
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].hidden must be boolean.`,
			);
		}
		if (rawNode.note !== undefined && typeof rawNode.note !== 'string') {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].note must be a string.`,
			);
		}
		const curated = rawNode.curated === true;
		if (
			(rawNode.hidden === true || rawNode.note !== undefined) &&
			!curated
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}] hidden/note requires curated: true.`,
			);
		}
		const hasX = Object.prototype.hasOwnProperty.call(rawNode, 'x');
		const hasY = Object.prototype.hasOwnProperty.call(rawNode, 'y');
		if (hasX !== hasY) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}] must define x and y together.`,
			);
		}
		if (
			hasX &&
			(typeof rawNode.x !== 'number' ||
				!Number.isFinite(rawNode.x) ||
				typeof rawNode.y !== 'number' ||
				!Number.isFinite(rawNode.y))
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}] x and y must be finite numbers.`,
			);
		}
		const hasGroup = Object.prototype.hasOwnProperty.call(rawNode, 'group');
		if (
			hasGroup &&
			type !== 'graph' &&
			type !== 'free' &&
			type !== 'cube'
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].group is invalid for ${type}.`,
			);
		}
		let group: string | null | undefined;
		if (hasGroup) {
			if (rawNode.group === null) {
				if (type === 'cube') {
					throw new Error(
						`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].group must identify a Cube group.`,
					);
				}
				group = null;
			} else if (
				typeof rawNode.group === 'string' &&
				rawNode.group.trim()
			) {
				group = rawNode.group.trim();
			} else {
				throw new Error(
					`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}].group must be a non-empty string or null.`,
				);
			}
		}
		const node: PersistedChartNodeV2 = {
			...(curated ? { curated: true } : {}),
			...(rawNode.hidden === true ? { hidden: true } : {}),
			...(typeof rawNode.note === 'string' && rawNode.note
				? { note: rawNode.note }
				: {}),
			...(hasX ? { x: rawNode.x as number, y: rawNode.y as number } : {}),
			...(hasGroup ? { group: group ?? null } : {}),
		};
		if (Object.keys(node).length === 0 && !allowUnknownFields) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${rawPath}] is empty.`,
			);
		}
		result[path] = node;
	}
	return result;
}

function normalizePresentation(
	value: unknown,
	fallback: PersistedPresentationV2,
): PersistedPresentationV2 {
	const record = isRecord(value) ? value : {};
	const panels = isRecord(record.panels) ? record.panels : {};
	const widths = isRecord(record.widths) ? record.widths : {};
	return {
		panels: {
			filters:
				typeof panels.filters === 'boolean'
					? panels.filters
					: fallback.panels.filters,
			inspector:
				typeof panels.inspector === 'boolean'
					? panels.inspector
					: fallback.panels.inspector,
		},
		widths: {
			dock: readNumber(widths.dock, fallback.widths.dock),
			curated: readNumber(widths.curated, fallback.widths.curated),
		},
		focusOnSelect:
			typeof record.focusOnSelect === 'boolean'
				? record.focusOnSelect
				: fallback.focusOnSelect,
	};
}

function normalizeTemplateOverrides(
	value: unknown,
): Record<string, PersistedTemplateOverrideV2> {
	if (!isRecord(value)) return {};
	return Object.fromEntries(
		Object.entries(value).flatMap(([templateId, override]) => {
			const record = isRecord(override) ? override : {};
			return typeof record.defaultGroup === 'string' &&
				record.defaultGroup.trim()
				? [[templateId, { defaultGroup: record.defaultGroup.trim() }]]
				: [];
		}),
	);
}

function validateUniqueTemplateIds(resources: PersistedResourcesV2): void {
	const seen = new Set<string>();
	for (const template of resources.templates ?? []) {
		if (seen.has(template.id)) {
			throw new Error(
				`Meta Graph v2 template ID is duplicated: ${template.id}`,
			);
		}
		seen.add(template.id);
	}
}

function validateGroupModes(
	value: unknown,
	type: MetaGraphChart['type'],
	chartIndex: number,
	allowUnknownFields: boolean,
): void {
	if (allowUnknownFields || !Array.isArray(value)) return;
	if (type === 'graph-3d' && value.length > 0) {
		throw new Error(
			`Meta Graph v2 charts[${chartIndex}].groups is invalid for graph-3d.`,
		);
	}
	for (const [groupIndex, rawGroup] of value.entries()) {
		if (!isRecord(rawGroup)) continue;
		const path = `charts[${chartIndex}].groups[${groupIndex}]`;
		if (type === 'cube') {
			if (rawGroup.mode !== undefined) {
				throw new Error(
					`Meta Graph v2 ${path}.mode is invalid for Cube system groups.`,
				);
			}
			if (
				typeof rawGroup.id === 'string' &&
				!V2_CUBE_GROUP_IDS.has(rawGroup.id)
			) {
				throw new Error(
					`Meta Graph v2 ${path}.id is not a Cube group.`,
				);
			}
			continue;
		}
		if (type === 'graph' || type === 'free') {
			if (
				rawGroup.mode !== undefined &&
				rawGroup.mode !== 'manual' &&
				rawGroup.mode !== 'rule'
			) {
				throw new Error(`Meta Graph v2 ${path}.mode is invalid.`);
			}
			continue;
		}
		if (rawGroup.mode !== 'rule') {
			throw new Error(
				`Meta Graph v2 ${path}.mode must be rule for ${type}.`,
			);
		}
	}
}

function validateChartReferences(
	value: unknown,
	chartIndex: number,
	resources: PersistedResourcesV2,
	allowUnknownFields: boolean,
): void {
	if (!isRecord(value)) return;
	const type = readChartType(value.type, `charts[${chartIndex}].type`);
	validateGroupModes(value.groups, type, chartIndex, allowUnknownFields);
	const groups = normalizeGroups(value.groups);
	const groupIds = new Set<string>();
	for (const group of groups) {
		if (groupIds.has(group.id)) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}] group ID is duplicated: ${group.id}`,
			);
		}
		groupIds.add(group.id);
	}
	for (const [path, node] of Object.entries(
		normalizePersistedNodes(
			value.nodes,
			chartIndex,
			type,
			allowUnknownFields,
		),
	)) {
		if (
			type === 'cube' &&
			typeof node.group === 'string' &&
			!V2_CUBE_GROUP_IDS.has(node.group)
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${path}].group is not a Cube group.`,
			);
		}
		if (
			type !== 'cube' &&
			typeof node.group === 'string' &&
			!groupIds.has(node.group)
		) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].nodes[${path}].group references a missing group.`,
			);
		}
	}
	const templateIds = new Set(
		(resources.templates ?? []).map((template) => template.id),
	);
	for (const [templateId, override] of Object.entries(
		normalizeTemplateOverrides(value.templateOverrides),
	)) {
		if (!templateIds.has(templateId)) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].templateOverrides references a missing template: ${templateId}`,
			);
		}
		if (!groupIds.has(override.defaultGroup)) {
			throw new Error(
				`Meta Graph v2 charts[${chartIndex}].templateOverrides[${templateId}] references a missing group: ${override.defaultGroup}`,
			);
		}
	}
}

function createDefaultPresentation(): PersistedPresentationV2 {
	return {
		panels: { filters: true, inspector: true },
		widths: { dock: 280, curated: 300 },
		focusOnSelect: true,
	};
}

function createPresentationFromChart(
	chart: MetaGraphChart,
): PersistedPresentationV2 {
	return {
		panels: {
			filters: chart.display.showFilters,
			inspector: chart.display.showInspector,
		},
		widths: {
			dock: chart.presentation.dockWidth,
			curated: chart.presentation.curatedPanelWidth,
		},
		focusOnSelect: chart.presentation.focusOnSelect,
	};
}

function readRequiredString(value: unknown, path: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`Meta Graph v2 ${path} must be a non-empty string.`);
	}
	return value.trim();
}

function readChartType(value: unknown, path: string): MetaGraphChart['type'] {
	const type = readRequiredString(value, path);
	if (
		type === 'graph' ||
		type === 'graph-3d' ||
		type === 'cube' ||
		type === 'free' ||
		type === 'flow' ||
		type === 'arc' ||
		type === 'hierarchical-edge-bundling'
	) {
		return type;
	}
	throw new Error(`Meta Graph v2 ${path} has unsupported value: ${type}`);
}

function validateLayoutFields(
	layout: Record<string, unknown>,
	type: MetaGraphChart['type'],
	chartIndex: number,
): void {
	const common = ['spacing'];
	const typeFields: Record<MetaGraphChart['type'], string[]> = {
		graph: ['forces'],
		'graph-3d': ['forces'],
		cube: ['forces'],
		free: [],
		flow: [
			'layerSpacing',
			'laneSpacing',
			'direction',
			'flowRelationRules',
			'edgeStyle',
		],
		arc: ['arcDirection', 'arcLabelAngle', 'nodeSort', 'nodeSortDirection'],
		'hierarchical-edge-bundling': ['nodeSort', 'nodeSortDirection'],
	};
	const allowed = new Set([...common, ...typeFields[type]]);
	const invalid = Object.keys(layout).find((key) => !allowed.has(key));
	if (invalid) {
		throw new Error(
			`Meta Graph v2 charts[${chartIndex}].layout.${invalid} is invalid for ${type}.`,
		);
	}
}

function validateRecordFields(
	value: Record<string, unknown>,
	allowedFields: readonly string[],
	path: string,
): void {
	const allowed = new Set(allowedFields);
	const invalid = Object.keys(value).find((key) => !allowed.has(key));
	if (invalid) {
		throw new Error(`Meta Graph v2 ${path}.${invalid} is invalid.`);
	}
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function createV2DefaultQuery(type: MetaGraphChart['type']): GraphQuery {
	return {
		roots: [],
		folders: [],
		tags: [],
		hiddenNodeRules: [],
		filterRoot: {
			id: 'root',
			kind: 'group',
			mode: 'all',
			children: [],
		},
		domains: [],
		relations:
			type === 'flow'
				? ['prerequisite', 'leads-to']
				: ['prerequisite', 'leads-to', 'related'],
		depth: 2,
		direction: 'both',
		maxNodes: V2_DEFAULT_MAX_NODES,
		showIsolatedNodes: false,
		showPlainLinks: false,
		showUnresolvedLinks: false,
	};
}

function readNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

function compactDefined<T extends Record<string, unknown>>(
	value: T,
): { [Key in keyof T]?: Exclude<T[Key], undefined> } {
	return Object.fromEntries(
		Object.entries(value).filter(([, item]) => item !== undefined),
	) as { [Key in keyof T]?: Exclude<T[Key], undefined> };
}

function valuesEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function roundCoordinate(value: number): number {
	const rounded = Math.round(value * 1000) / 1000;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function layoutEngineForType(type: string): ChartLayoutConfig['engine'] {
	switch (type) {
		case 'flow':
			return 'elk';
		case 'arc':
			return 'arc';
		case 'hierarchical-edge-bundling':
			return 'hierarchical-edge-bundling';
		case 'graph-3d':
			return 'force-3d';
		case 'cube':
			return 'cube-3d';
		case 'free':
			return 'free';
		default:
			return 'force-atlas';
	}
}
