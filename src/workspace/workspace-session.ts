import type { MetaGraphDocument, WorkspaceState } from '../core/types';
import { cloneSerializable } from './state/persistence';
import type {
	WorkspacePersistenceContext,
	WorkspaceSessionState,
} from './meta-graph-v2/types';

export function applyWorkspaceSession(
	document: MetaGraphDocument,
	context: WorkspacePersistenceContext,
	session: WorkspaceSessionState | undefined,
): MetaGraphDocument {
	const next = cloneSerializable(document);
	const activeChart =
		session?.activeChart &&
		next.charts.some((chart) => chart.id === session.activeChart)
			? session.activeChart
			: context.defaultChart;
	next.activeChart = next.charts.some((chart) => chart.id === activeChart)
		? activeChart
		: (next.charts[0]?.id ?? 'knowledge-map');
	for (const chart of next.charts) {
		const chartSession = session?.charts?.[chart.id];
		if (!chartSession) continue;
		if (chartSession.showFilters !== undefined) {
			chart.presentation.showFilters = chartSession.showFilters;
			chart.display.showFilters = chartSession.showFilters;
		}
		if (chartSession.showInspector !== undefined) {
			chart.presentation.showInspector = chartSession.showInspector;
			chart.display.showInspector = chartSession.showInspector;
		}
		if (chartSession.dockWidth !== undefined) {
			chart.presentation.dockWidth = chartSession.dockWidth;
		}
		if (chartSession.curatedPanelWidth !== undefined) {
			chart.presentation.curatedPanelWidth =
				chartSession.curatedPanelWidth;
		}
		if (chartSession.focusOnSelect !== undefined) {
			chart.presentation.focusOnSelect = chartSession.focusOnSelect;
		}
	}
	const active = next.charts.find((chart) => chart.id === next.activeChart);
	if (active) {
		next.dock.dockWidth = active.presentation.dockWidth;
		next.dock.curatedPanelWidth = active.presentation.curatedPanelWidth;
		next.dock.focusOnSelect = active.presentation.focusOnSelect;
		next.dock.templates = next.dock.templates.map((template) => ({
			...template,
			defaultGroupId:
				active.templateOverrides[template.id]?.defaultGroupId,
		}));
	}
	const activeConnection = session?.activeConnection;
	const activeSpec = next.connectionFieldSpecs.find(
		(spec) => spec.id === activeConnection,
	);
	if (activeSpec) {
		next.activeConnectionFieldSpecId = activeSpec.id;
		next.activeConnectionField = activeSpec.field;
	}
	return next;
}

export function createWorkspaceSessionState(
	state: WorkspaceState,
	shell?: WorkspaceSessionState['shell'],
): WorkspaceSessionState {
	return {
		activeChart: state.activeChartId,
		activeConnection: state.activeConnectionFieldSpecId,
		charts: Object.fromEntries(
			state.charts.map((chart) => [
				chart.id,
				{
					showFilters: chart.presentation.showFilters,
					showInspector: chart.presentation.showInspector,
					dockWidth: chart.presentation.dockWidth,
					curatedPanelWidth: chart.presentation.curatedPanelWidth,
					focusOnSelect: chart.presentation.focusOnSelect,
				},
			]),
		),
		...(shell ? { shell: cloneSerializable(shell) } : {}),
	};
}

export function normalizeWorkspaceSessions(
	value: unknown,
): Record<string, WorkspaceSessionState> {
	if (!isRecord(value)) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, session]) => {
			return isRecord(session)
				? [[key, normalizeWorkspaceSession(session)]]
				: [];
		}),
	);
}

function normalizeWorkspaceSession(
	value: Record<string, unknown>,
): WorkspaceSessionState {
	const charts = isRecord(value.charts)
		? Object.fromEntries(
				Object.entries(value.charts).flatMap(([chartId, chart]) => {
					if (!chartId || !isRecord(chart)) return [];
					return [
						[
							chartId,
							{
								...(typeof chart.showFilters === 'boolean'
									? { showFilters: chart.showFilters }
									: {}),
								...(typeof chart.showInspector === 'boolean'
									? { showInspector: chart.showInspector }
									: {}),
								...(isFiniteNumber(chart.dockWidth)
									? {
											dockWidth: clamp(
												chart.dockWidth,
												260,
												520,
											),
										}
									: {}),
								...(isFiniteNumber(chart.curatedPanelWidth)
									? {
											curatedPanelWidth: clamp(
												chart.curatedPanelWidth,
												240,
												420,
											),
										}
									: {}),
								...(typeof chart.focusOnSelect === 'boolean'
									? { focusOnSelect: chart.focusOnSelect }
									: {}),
							},
						],
					];
				}),
			)
		: {};
	const shell = isRecord(value.shell) ? value.shell : {};
	return {
		...(typeof value.activeChart === 'string' && value.activeChart.trim()
			? { activeChart: value.activeChart.trim() }
			: {}),
		...(typeof value.activeConnection === 'string' &&
		value.activeConnection.trim()
			? { activeConnection: value.activeConnection.trim() }
			: {}),
		...(Object.keys(charts).length > 0 ? { charts } : {}),
		shell: {
			...(shell.rightPanelTab === 'details' ||
			shell.rightPanelTab === 'pinned' ||
			shell.rightPanelTab === 'templates'
				? { rightPanelTab: shell.rightPanelTab }
				: {}),
			...(typeof shell.dockOpen === 'boolean'
				? { dockOpen: shell.dockOpen }
				: {}),
			...(typeof shell.curatedPanelOpen === 'boolean'
				? { curatedPanelOpen: shell.curatedPanelOpen }
				: {}),
			...(typeof shell.connectionOpen === 'boolean'
				? { connectionOpen: shell.connectionOpen }
				: {}),
			...(shell.connectionLayout === 'single' ||
			shell.connectionLayout === 'wrap'
				? { connectionLayout: shell.connectionLayout }
				: {}),
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
