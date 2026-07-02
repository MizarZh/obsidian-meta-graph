import { TFolder, type App } from 'obsidian';
import { MetadataIndexer } from '../../core/metadata-indexer';
import type {
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
	connectionFields: string[],
): WorkspaceIndexSnapshot {
	const indexer = new MetadataIndexer(app, debug, connectionFields);
	const index = indexer.build();
	const nodes = [...index.nodes.values()];
	return {
		index,
		unresolvedLinks: [...indexer.unresolvedLinks],
		metadataSources: [...indexer.metadataSources],
		availableFolders: readVaultFolders(app),
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
			.filter((file): file is TFolder => file instanceof TFolder)
			.map((folder) => folder.path)
			.filter((path) => path !== '/'),
	);
}
