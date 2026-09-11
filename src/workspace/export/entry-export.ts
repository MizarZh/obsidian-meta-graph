import type {
	GraphProjection,
	KnowledgeEdge,
	KnowledgeNode,
	WorkspaceState,
} from '@/core/types';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type { ChartExportOptions } from './export-options';

export interface EntrySelection {
	nodeId?: string;
	edgeId?: string;
	groupId?: string;
}

export interface EntryExportDocument {
	format: 'meta-graph-entries';
	version: 1;
	chart: { id: string; name: string; type: WorkspaceState['mode'] };
	scope: 'chart' | 'selection';
	nodes: Array<
		Pick<
			KnowledgeNode,
			'id' | 'path' | 'title' | 'folder' | 'tags' | 'domains'
		> & {
			kind: string;
			groupId?: string;
			metadata?: Record<string, unknown>;
		}
	>;
	edges: KnowledgeEdge[];
}

export function selectExportEntries(
	projection: GraphProjection,
	graph?: RuntimeGraph,
	selection?: EntrySelection,
	groupByNode: ReadonlyMap<string, string> = new Map(),
): GraphProjection {
	let nodes = projection.nodes.filter(
		(node) =>
			!projection.hiddenNodeIds?.has(node.id) &&
			(!graph?.hasNode(node.id) ||
				!graph.getNodeAttribute(node.id, 'hidden')),
	);
	const visible = new Set(nodes.map((node) => node.id));
	const styleHidden = new Set<string>();
	graph?.forEachEdge((id, attributes) => {
		if (
			attributes.styleHidden ||
			(attributes.hidden && !attributes.logicalEdgeId)
		)
			styleHidden.add(attributes.logicalEdgeId ?? id);
	});
	const ids = new Set<string>();
	let edges = projection.edges.filter((edge) => {
		if (
			ids.has(edge.id) ||
			styleHidden.has(edge.id) ||
			!visible.has(edge.source) ||
			!visible.has(edge.target)
		)
			return false;
		ids.add(edge.id);
		return true;
	});
	if (selection) {
		const selected = new Set<string>();
		if (selection.edgeId) {
			edges = edges.filter((edge) => edge.id === selection.edgeId);
			for (const edge of edges) {
				selected.add(edge.source);
				selected.add(edge.target);
			}
		} else {
			for (const node of nodes)
				if (
					node.id === selection.nodeId ||
					(selection.groupId &&
						groupByNode.get(node.id) === selection.groupId)
				)
					selected.add(node.id);
			edges = edges.filter(
				(edge) =>
					selected.has(edge.source) && selected.has(edge.target),
			);
		}
		nodes = nodes.filter((node) => selected.has(node.id));
	}
	return { nodes, edges, rootIds: new Set(projection.rootIds) };
}

export function createEntryDocument(
	state: WorkspaceState,
	options: ChartExportOptions,
	graph?: RuntimeGraph,
	groupByNode: ReadonlyMap<string, string> = new Map(),
): EntryExportDocument {
	if (!state.projection) throw new Error('Chart data is not ready');
	const selected = selectExportEntries(
		state.projection,
		graph,
		options.entryScope === 'selection'
			? {
					nodeId: state.selectedNodeId,
					edgeId: state.selectedEdgeId,
					groupId: state.selectedGroupId,
				}
			: undefined,
		groupByNode,
	);
	if (
		options.entryScope === 'selection' &&
		!selected.nodes.length &&
		!selected.edges.length
	)
		throw new Error('No visible selection to export');
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	return {
		format: 'meta-graph-entries',
		version: 1,
		chart: {
			id: state.activeChartId,
			name: chart?.name ?? 'Graph',
			type: state.mode,
		},
		scope: options.entryScope,
		nodes:
			options.entries === 'edges'
				? []
				: selected.nodes.map((node) => ({
						id: node.id,
						path: node.path,
						title: node.title,
						kind: node.kind ?? 'note',
						folder: node.folder,
						tags: [...node.tags],
						domains: [...node.domains],
						groupId: groupByNode.get(node.id),
						...(options.includeMetadata
							? { metadata: structuredClone(node.metadata ?? {}) }
							: {}),
					})),
		edges:
			options.entries === 'nodes'
				? []
				: selected.edges.map((edge) => ({
						id: edge.id,
						source: edge.source,
						target: edge.target,
						relation: edge.relation,
						directed: edge.directed,
						kind: edge.kind ?? 'relation',
						semantic: edge.semantic,
						sourcePath: edge.sourcePath,
						sourceField: edge.sourceField,
					})),
	};
}

/** Quote multiline cells and neutralize spreadsheet formulas, including leading whitespace. */
export function csvCell(value: unknown): string {
	let text =
		value === undefined || value === null
			? ''
			: typeof value === 'object'
				? JSON.stringify(value)
				: typeof value === 'string'
					? value
					: typeof value === 'number' ||
						  typeof value === 'boolean' ||
						  typeof value === 'bigint'
						? String(value)
						: '';
	if (typeof value === 'string' && /^[\s]*[=+@-]/u.test(text))
		text = `'${text}`;
	return `"${text.replace(/"/gu, '""')}"`;
}

const markdownText = (value: string): string =>
	value.replace(/[\r\n]+/gu, ' ').replace(/[\\`*_{}[\]<>#|]/gu, '\\$&');
const noteLink = (node: EntryExportDocument['nodes'][number]): string =>
	node.kind === 'unresolved'
		? markdownText(node.title)
		: `[${markdownText(node.title)}](${node.path
				.split('/')
				.map((part) =>
					encodeURIComponent(part).replace(
						/[()]/gu,
						(char) =>
							`%${char.charCodeAt(0).toString(16).toUpperCase()}`,
					),
				)
				.join('/')})`;

export function serializeEntries(
	data: EntryExportDocument,
	format: 'json' | 'csv' | 'md',
	includeMetadata = false,
): Blob {
	if (format === 'json')
		return new Blob([`${JSON.stringify(data, null, 2)}\n`], {
			type: 'application/json;charset=utf-8',
		});
	if (format === 'csv') {
		const columns = [
			'record_type',
			'id',
			'title',
			'path',
			'kind',
			'folder',
			'tags',
			'domains',
			'group_id',
			'source',
			'target',
			'relation',
			'directed',
			'source_path',
			'source_field',
			...(includeMetadata ? ['metadata'] : []),
		];
		const rows: unknown[][] = [
			columns,
			...data.nodes.map((node) => [
				'node',
				node.id,
				node.title,
				node.path,
				node.kind,
				node.folder,
				node.tags,
				node.domains,
				node.groupId,
				'',
				'',
				'',
				'',
				'',
				'',
				...(includeMetadata ? [node.metadata] : []),
			]),
			...data.edges.map((edge) => [
				'edge',
				edge.id,
				'',
				'',
				edge.kind,
				'',
				'',
				'',
				'',
				edge.source,
				edge.target,
				edge.relation,
				edge.directed,
				edge.sourcePath,
				edge.sourceField,
				...(includeMetadata ? [''] : []),
			]),
		];
		return new Blob(
			[
				'\uFEFF',
				rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
				'\r\n',
			],
			{ type: 'text/csv;charset=utf-8' },
		);
	}
	const lines = [
		`# ${markdownText(data.chart.name)}`,
		'',
		`Nodes: ${data.nodes.length} · Relationships: ${data.edges.length}`,
		'',
	];
	if (data.nodes.length) {
		lines.push('## Notes', '');
		for (const node of data.nodes) {
			lines.push(`- ${noteLink(node)}`);
			if (includeMetadata && node.metadata)
				lines.push(
					'',
					...JSON.stringify(node.metadata, null, 2)
						.split('\n')
						.map((line) => `    ${line}`),
					'',
				);
		}
	}
	if (data.edges.length) {
		lines.push('', '## Relationships', '');
		for (const edge of data.edges)
			lines.push(
				`- ${markdownText(edge.source)} ${edge.directed ? '→' : '↔'} ${markdownText(edge.target)} — ${markdownText(edge.relation)} (field: ${markdownText(edge.sourceField)})`,
			);
	}
	return new Blob([`${lines.join('\n')}\n`], {
		type: 'text/markdown;charset=utf-8',
	});
}
