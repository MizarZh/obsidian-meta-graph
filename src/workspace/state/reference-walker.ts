import type {
	GraphQuery,
	MetaGraphChart,
	NodeFilterGroup,
	NodeFilterItem,
	WorkspaceState,
} from '../../core/types';
import { normalizeTextPath } from '../meta-graph/utils';
import { createUpdatedActiveChartStateFields } from './active-chart-state';

const PATH_FILTER_OPERATORS = new Set([
	'links-to',
	'does-not-link-to',
	'in-folder',
	'is-not-in-folder',
]);

const PATH_FILTER_FIELDS = new Set([
	'file.file',
	'file.path',
	'file.folder',
	'file.links',
	'folder',
]);

export interface WorkspaceReferenceUpdate {
	state: WorkspaceState;
	changed: boolean;
}

export function updateWorkspaceReferencesInState(
	state: WorkspaceState,
	oldPath: string,
	newPath: string,
): WorkspaceReferenceUpdate {
	const from = normalizeTextPath(oldPath);
	const to = normalizeTextPath(newPath);
	if (!from || !to || from === to) return { state, changed: false };

	const charts = state.charts.map((chart) =>
		updateChartReferences(chart, from, to),
	);
	const globalQuery = updateQueryReferences(state.globalQuery, from, to);
	const dock = {
		...state.dock,
		notes: state.dock.notes.map((note) => ({
			...note,
			path: replacePath(note.path, from, to),
		})),
		templates: state.dock.templates.map((template) => ({
			...template,
			templatePath: replacePath(template.templatePath, from, to),
			targetFolder: replacePath(template.targetFolder, from, to),
		})),
	};
	const activeChart = charts.find(
		(chart) => chart.id === state.activeChartId,
	);
	const nextState: WorkspaceState = {
		...state,
		charts,
		globalQuery,
		dock,
		currentNoteId: replaceOptionalPath(state.currentNoteId, from, to),
		selectedNodeId: replaceOptionalPath(state.selectedNodeId, from, to),
		hoveredNodeId: replaceOptionalPath(state.hoveredNodeId, from, to),
		...(activeChart
			? createUpdatedActiveChartStateFields(activeChart, state)
			: {}),
	};
	const changed = JSON.stringify(nextState) !== JSON.stringify(state);
	return { state: changed ? nextState : state, changed };
}

function updateChartReferences(
	chart: MetaGraphChart,
	from: string,
	to: string,
): MetaGraphChart {
	const nodes = Object.fromEntries(
		Object.entries(chart.layout.manual?.nodes ?? {}).map(
			([path, position]) => [replacePath(path, from, to), position],
		),
	);
	const overrides = Object.fromEntries(
		Object.entries(chart.grouping.overrides).map(([path, groupId]) => [
			replacePath(path, from, to),
			groupId,
		]),
	);
	return {
		...chart,
		query: updateQueryReferences(chart.query, from, to),
		curated: {
			...chart.curated,
			files: chart.curated.files.map((file) => ({
				...file,
				path: replacePath(file.path, from, to),
			})),
		},
		grouping: {
			groups: chart.grouping.groups.map((group) => ({
				...group,
				...(group.rule
					? { rule: updateFilterGroup(group.rule, from, to) }
					: {}),
			})),
			overrides,
		},
		layout: {
			...chart.layout,
			...(chart.layout.manual
				? { manual: { ...chart.layout.manual, nodes } }
				: {}),
		},
	};
}

function updateQueryReferences(
	query: GraphQuery,
	from: string,
	to: string,
): GraphQuery {
	return {
		...query,
		roots: query.roots.map((path) => replacePath(path, from, to)),
		folders: query.folders.map((path) => replacePath(path, from, to)),
		filterRoot: query.filterRoot
			? updateFilterGroup(query.filterRoot, from, to)
			: undefined,
		hiddenNodeRules: query.hiddenNodeRules.map((rule) => ({
			...rule,
			value: shouldUpdateFilterValue(rule.field, rule.operator)
				? replacePath(rule.value, from, to)
				: rule.value,
		})),
	};
}

function updateFilterGroup(
	group: NodeFilterGroup,
	from: string,
	to: string,
): NodeFilterGroup {
	return {
		...group,
		children: group.children.map((item): NodeFilterItem => {
			if (item.kind === 'group') return updateFilterGroup(item, from, to);
			return {
				...item,
				value: shouldUpdateFilterValue(item.field, item.operator)
					? replacePath(item.value, from, to)
					: item.value,
			};
		}),
	};
}

function shouldUpdateFilterValue(
	field: string,
	operator: string | undefined,
): boolean {
	return (
		PATH_FILTER_FIELDS.has(field) ||
		PATH_FILTER_OPERATORS.has(operator ?? '')
	);
}

function replaceOptionalPath(
	value: string | undefined,
	from: string,
	to: string,
): string | undefined {
	return value ? replacePath(value, from, to) : undefined;
}

function replacePath(value: string, from: string, to: string): string {
	const normalized = normalizeTextPath(value);
	if (normalized === from) return to;
	return normalized.startsWith(`${from}/`)
		? `${to}${normalized.slice(from.length)}`
		: normalized;
}
