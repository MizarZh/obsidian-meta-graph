import type { App, TFolder } from 'obsidian';
import {
	createKnowledgeIndexFromMetadataRecords,
	MetadataIndexer,
	type MetadataIndexRecord,
} from '../../core/metadata-indexer';
import type {
	ConnectionFieldSpec,
	GraphProjection,
	KnowledgeIndex,
	MetadataDebugEntry,
	UnresolvedLink,
	WorkspaceState,
} from '../../core/types';
import { CuratedProjectionEngine } from '../../query/curated';
import { GraphQueryEngine } from '../../query/neighborhood';

export interface WorkspaceIndexSnapshot {
	index: KnowledgeIndex;
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
	availableFolders: string[];
	availableTags: string[];
	availableDomains: string[];
}

export interface WorkspaceIndexBuild {
	snapshot: WorkspaceIndexSnapshot;
	records: Map<string, MetadataIndexRecord>;
	filePaths: Set<string>;
}

export class WorkspaceProjectionService {
	private readonly queryEngine = new GraphQueryEngine();
	private readonly curatedEngine = new CuratedProjectionEngine();

	project(index: KnowledgeIndex, state: WorkspaceState): GraphProjection {
		return state.chartSource === 'curated'
			? this.curatedEngine.project(index, state.curated, {
					showPlainLinks: state.query.showPlainLinks,
					showUnresolvedLinks: state.query.showUnresolvedLinks,
				})
			: this.queryEngine.project(index, state.query, state.globalQuery);
	}
}

export function buildWorkspaceIndex(
	app: App,
	debug: boolean,
	connectionFields: string[] | ConnectionFieldSpec[],
): WorkspaceIndexSnapshot {
	return buildWorkspaceIndexState(app, debug, connectionFields).snapshot;
}

export function buildWorkspaceIndexState(
	app: App,
	debug: boolean,
	connectionFields: string[] | ConnectionFieldSpec[],
): WorkspaceIndexBuild {
	const indexer = new MetadataIndexer(app, debug, connectionFields);
	const records = indexer.buildRecords();
	const filePaths = new Set(records.keys());
	return {
		snapshot: rebuildWorkspaceIndexSnapshot(records, readVaultFolders(app)),
		records,
		filePaths,
	};
}

export function rebuildWorkspaceIndexSnapshot(
	records: ReadonlyMap<string, MetadataIndexRecord>,
	availableFolders: string[],
): WorkspaceIndexSnapshot {
	const index = createKnowledgeIndexFromMetadataRecords(records.values());
	const nodes = [...index.nodes.values()];
	return {
		index,
		unresolvedLinks: [...records.values()].flatMap(
			(record) => record.unresolvedLinks,
		),
		metadataSources: [...records.values()].flatMap(
			(record) => record.metadataSources,
		),
		availableFolders,
		availableTags: uniqueSorted(nodes.flatMap((node) => node.tags)),
		availableDomains: uniqueSorted(nodes.flatMap((node) => node.domains)),
	};
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) =>
		left.localeCompare(right),
	);
}

function readVaultFolders(app: App): string[] {
	return uniqueSorted(
		app.vault
			.getAllLoadedFiles()
			.filter(isTFolder)
			.map((folder) => folder.path)
			.filter((path) => path !== '/'),
	);
}

function isTFolder(file: unknown): file is TFolder {
	return (
		typeof file === 'object' &&
		file !== null &&
		'path' in file &&
		typeof file.path === 'string' &&
		'children' in file &&
		Array.isArray(file.children)
	);
}
