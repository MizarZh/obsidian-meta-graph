import type { MetaGraphDocument, WorkspaceState } from '../../core/types';
import { createInitialActiveChartStateFields } from './active-chart-state';
import { cloneSerializable } from './persistence';
import { createDefaultMetaGraphDocument } from '../meta-graph-model';

export function createWorkspaceState(
	maxNodes: number,
	fadeDistance = 1.5,
	document?: MetaGraphDocument,
): WorkspaceState {
	const metaGraphDocument =
		document ?? createDefaultMetaGraphDocument(maxNodes, fadeDistance);
	const activeChart =
		metaGraphDocument.charts.find(
			(chart) => chart.id === metaGraphDocument.activeChart,
		) ?? metaGraphDocument.charts[0];
	if (!activeChart) {
		return createWorkspaceState(
			maxNodes,
			fadeDistance,
			createDefaultMetaGraphDocument(maxNodes, fadeDistance),
		);
	}
	const state: WorkspaceState = {
		charts: cloneSerializable(metaGraphDocument.charts),
		activeChartId: activeChart.id,
		...createInitialActiveChartStateFields(activeChart),
		flowRelationConflictCount: 0,
		layoutRevision: 0,
		globalQuery: cloneSerializable(metaGraphDocument.globalQuery),
		defaultNodeStyle: cloneSerializable(
			metaGraphDocument.globalStyle.defaultNodeStyle,
		),
		defaultLinkStyle: cloneSerializable(
			metaGraphDocument.globalStyle.defaultLinkStyle,
		),
		globalNodeStyleRules: cloneSerializable(
			metaGraphDocument.globalStyle.nodeRules,
		),
		globalLinkStyleRules: cloneSerializable(
			metaGraphDocument.globalStyle.linkRules,
		),
		connectionFields: cloneSerializable(metaGraphDocument.connectionFields),
		connectionFieldSpecs: cloneSerializable(
			metaGraphDocument.connectionFieldSpecs,
		),
		connectionFieldModes: cloneSerializable(
			metaGraphDocument.connectionFieldModes,
		),
		activeConnectionFieldSpecId:
			metaGraphDocument.activeConnectionFieldSpecId,
		activeConnectionField: metaGraphDocument.activeConnectionField,
		connectionUndoCount: 0,
		dock: {
			...cloneSerializable(metaGraphDocument.dock),
			dockWidth: activeChart.presentation.dockWidth,
			curatedPanelWidth: activeChart.presentation.curatedPanelWidth,
			focusOnSelect: activeChart.presentation.focusOnSelect,
			templates: metaGraphDocument.dock.templates.map((template) => ({
				...cloneSerializable(template),
				defaultGroupId:
					activeChart.templateOverrides[template.id]?.defaultGroupId,
			})),
		},
		availableFolders: [],
		availableTags: [],
		availableDomains: [],
	};
	return state;
}
