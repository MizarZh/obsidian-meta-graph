import type {
	GraphProjection,
	KnowledgeIndex,
	MetaGraphChart,
	WorkspaceState,
} from '../../core/types';
import { normalizeCubeLayout } from '../state/manual-layout';
import { cloneSerializable } from '../state/persistence';
import { pruneMissingCuratedFiles } from '../state/curated-state';
import type { WorkspaceIndexSnapshot } from '../services/query-service';

export function applyWorkspaceIndexSnapshotToState(
	state: WorkspaceState,
	indexSnapshot: WorkspaceIndexSnapshot,
	forceLayout: boolean,
): WorkspaceState {
	const charts = pruneMissingCuratedFiles(
		state.charts,
		new Set(indexSnapshot.index.nodes.keys()),
	);
	const activeChart = charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	return {
		...state,
		charts,
		curated: activeChart?.curated ?? state.curated,
		layoutRevision: state.layoutRevision + (forceLayout ? 1 : 0),
		availableFolders: indexSnapshot.availableFolders,
		availableTags: indexSnapshot.availableTags,
		availableDomains: indexSnapshot.availableDomains,
	};
}

export function applyWorkspaceProjectionToState(
	state: WorkspaceState,
	projection: GraphProjection,
): WorkspaceState {
	const selectedNodeId =
		state.selectedNodeId &&
		projection.nodes.some((node) => node.id === state.selectedNodeId)
			? state.selectedNodeId
			: undefined;
	return withCubeLayout({ ...state, projection, selectedNodeId }, projection);
}

export type WorkspaceProjector = (
	index: KnowledgeIndex,
	state: WorkspaceState,
) => GraphProjection;

export function projectWorkspaceState(
	state: WorkspaceState,
	index: KnowledgeIndex,
	projector: WorkspaceProjector,
): WorkspaceState {
	return applyWorkspaceProjectionToState(state, projector(index, state));
}

function withCubeLayout(
	state: WorkspaceState,
	projection: GraphProjection,
): WorkspaceState {
	const activeChart = state.charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	if (!activeChart || activeChart.type !== 'cube') {
		return state;
	}
	const layout = normalizeCubeLayout(
		activeChart.layout,
		projection.nodes.map((node) => node.id),
	);
	if (layout === activeChart.layout) {
		return state;
	}
	return {
		...state,
		charts: updateChart(state.charts, { ...activeChart, layout }),
		manualLayout: cloneSerializable(
			layout.manual ?? { nodes: {}, groups: [] },
		),
		layoutRevision: state.layoutRevision + 1,
	};
}

function updateChart(
	charts: MetaGraphChart[],
	nextChart: MetaGraphChart,
): MetaGraphChart[] {
	return charts.map((chart) =>
		chart.id === nextChart.id ? nextChart : chart,
	);
}
