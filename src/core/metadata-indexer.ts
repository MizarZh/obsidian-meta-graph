import type { App, CachedMetadata, TFile } from 'obsidian';
import {
	addEdge,
	addNode,
	createEdgeId,
	createKnowledgeIndex,
	normalizePath,
} from './knowledge-index';
import { ObsidianLinkResolver } from './link-resolver';
import {
	isRelationField,
	parseRelations,
	toStringArray,
} from './relation-parser';
import type {
	KnowledgeEdge,
	KnowledgeIndex,
	KnowledgeNode,
	MetadataDebugEntry,
	UnresolvedLink,
} from './types';

export class MetadataIndexer {
	readonly unresolvedLinks: UnresolvedLink[] = [];
	readonly metadataSources: MetadataDebugEntry[] = [];

	constructor(
		private readonly app: App,
		private readonly debug = false,
		private readonly relationFields: string[] = [],
	) {}

	build(): KnowledgeIndex {
		this.unresolvedLinks.length = 0;
		this.metadataSources.length = 0;
		const index = createKnowledgeIndex();
		const files = this.app.vault.getMarkdownFiles();
		const filePaths = new Set(
			files.map((file) => normalizePath(file.path)),
		);

		for (const file of files) {
			addNode(
				index,
				this.createNode(
					file,
					this.app.metadataCache.getFileCache(file),
				),
			);
		}

		const resolver = new ObsidianLinkResolver(this.app);
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = asFrontmatter(cache?.frontmatter);
			const frontmatterLinks = (cache?.frontmatterLinks ?? []).map(
				(link) => ({
					key: link.key,
					link: link.link,
					original: link.original,
				}),
			);
			const relationFrontmatterLinks = frontmatterLinks.filter((link) =>
				isRelationField(
					link.key.split(/[.[\]]/u)[0] ?? link.key,
					this.relationFields,
				),
			);
			const relationProperties = Object.fromEntries(
				Object.entries(frontmatter ?? {}).filter(([field]) =>
					isRelationField(field, this.relationFields),
				),
			);
			if (
				Object.keys(relationProperties).length > 0 ||
				relationFrontmatterLinks.length > 0
			) {
				this.metadataSources.push({
					path: file.path,
					relationProperties,
					frontmatterLinks: relationFrontmatterLinks,
				});
			}
			const edges = parseRelations(
				frontmatter,
				file.path,
				resolver,
				(linkText, sourcePath) => {
					this.unresolvedLinks.push({ linkText, sourcePath });
					if (this.debug) {
						console.debug(
							`[Knowledge Workspace] Unresolved link "${linkText}" in ${sourcePath}`,
						);
					}
				},
				relationFrontmatterLinks,
				this.relationFields,
			);
			for (const edge of edges) {
				if (filePaths.has(edge.source) && filePaths.has(edge.target)) {
					addEdge(index, edge);
				}
			}
			for (const edge of createPlainLinkEdges(file, cache, resolver)) {
				if (filePaths.has(edge.source) && filePaths.has(edge.target)) {
					addEdge(index, edge);
				}
			}
		}

		return index;
	}

	private createNode(
		file: TFile,
		cache: CachedMetadata | null,
	): KnowledgeNode {
		const frontmatter = asFrontmatter(cache?.frontmatter);
		const metadataFields = Object.keys(frontmatter ?? {}).sort(
			(left, right) =>
				left.localeCompare(right, undefined, { sensitivity: 'base' }),
		);
		const links = uniqueStrings([
			...(cache?.links ?? []).map((link) => link.link),
			...(cache?.frontmatterLinks ?? []).map((link) => link.link),
		]).sort((left, right) =>
			left.localeCompare(right, undefined, { sensitivity: 'base' }),
		);
		const embeds = uniqueStrings(
			(cache?.embeds ?? []).map((embed) => embed.link),
		).sort((left, right) =>
			left.localeCompare(right, undefined, { sensitivity: 'base' }),
		);
		const tags = new Set(toStringArray(frontmatter?.tags));
		for (const tag of cache?.tags ?? []) {
			tags.add(tag.tag.replace(/^#/, ''));
		}

		const id = normalizePath(file.path);
		const aliases = uniqueStrings([
			...toStringArray(frontmatter?.aliases),
			...toStringArray(frontmatter?.alias),
		]);
		return {
			id,
			path: id,
			title: file.basename,
			fileName: file.name,
			extension: file.extension,
			fileSize: file.stat.size,
			createdTime: file.stat.ctime,
			modifiedTime: file.stat.mtime,
			aliases,
			folder: file.parent?.path === '/' ? '' : (file.parent?.path ?? ''),
			domains: toStringArray(frontmatter?.domain),
			tags: [...tags],
			links,
			embeds,
			noteType: firstString(frontmatter?.type),
			metadataFields,
			metadata: frontmatter ?? {},
		};
	}
}

function createPlainLinkEdges(
	file: TFile,
	cache: CachedMetadata | null,
	resolver: ObsidianLinkResolver,
): KnowledgeEdge[] {
	const source = normalizePath(file.path);
	const edges = new Map<string, KnowledgeEdge>();
	for (const link of cache?.links ?? []) {
		const targetPath = resolver.resolve(link.link, source);
		if (!targetPath) {
			continue;
		}
		const target = normalizePath(targetPath);
		if (target === source) {
			continue;
		}
		const id = createEdgeId(source, 'plain-link', target, true);
		edges.set(id, {
			id,
			kind: 'plain-link',
			semantic: false,
			source,
			target,
			relation: 'link',
			directed: true,
			sourcePath: source,
			sourceField: 'body',
		});
	}
	return [...edges.values()];
}

function asFrontmatter(
	value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	return value;
}

function firstString(value: unknown): string | undefined {
	return toStringArray(value)[0];
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}
