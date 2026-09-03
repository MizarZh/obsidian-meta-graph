import type { App, CachedMetadata, TFile } from 'obsidian';
import {
	addEdge,
	addNode,
	createEdgeId,
	createKnowledgeIndex,
	normalizePath,
} from './knowledge-index';
import { extractLinkText, ObsidianLinkResolver } from './link-resolver';
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
	ConnectionFieldSpec,
} from './types';
import { normalizeTags } from './tags';

export class MetadataIndexer {
	private readonly resolver: ObsidianLinkResolver;

	constructor(
		private readonly app: App,
		private readonly debug = false,
		relationConfig: string[] | ConnectionFieldSpec[] = [],
	) {
		this.resolver = new ObsidianLinkResolver(app);
		this.relationSpecs = relationConfig.filter(
			(item): item is ConnectionFieldSpec => typeof item !== 'string',
		);
		this.relationFields = uniqueStrings(
			relationConfig.flatMap((item) =>
				typeof item === 'string'
					? [item]
					: item.mode === 'paired' && item.reverseField
						? [item.field, item.reverseField]
						: [item.field],
			),
		);
	}

	private readonly relationFields: string[];
	private readonly relationSpecs: ConnectionFieldSpec[];

	buildRecords(): Map<string, MetadataIndexRecord> {
		const files = this.app.vault.getMarkdownFiles();
		const filePaths = new Set(
			files.map((file) => normalizePath(file.path)),
		);
		return new Map(
			files.map((file) => {
				const record = this.buildFileRecord(file, filePaths);
				return [record.path, record];
			}),
		);
	}

	buildFileRecord(
		file: TFile,
		filePaths: ReadonlySet<string>,
	): MetadataIndexRecord {
		const unresolvedLinks: UnresolvedLink[] = [];
		const metadataSources: MetadataDebugEntry[] = [];
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
			metadataSources.push({
				path: file.path,
				relationProperties,
				frontmatterLinks: relationFrontmatterLinks,
			});
		}

		const resolver = this.resolver;
		const relationEdges = parseRelations(
			frontmatter,
			file.path,
			resolver,
			(linkText, sourcePath) => {
				unresolvedLinks.push({ linkText, sourcePath });
				if (this.debug) {
					console.debug(
						`[Knowledge Workspace] Unresolved link "${linkText}" in ${sourcePath}`,
					);
				}
			},
			relationFrontmatterLinks,
			this.relationFields,
			this.relationSpecs,
		).filter(
			(edge) => filePaths.has(edge.source) && filePaths.has(edge.target),
		);
		const plainLinks = createPlainLinkEntries(file, cache, resolver);
		return {
			path: normalizePath(file.path),
			node: this.createNode(file, cache),
			additionalNodes: plainLinks.nodes,
			edges: [
				...relationEdges,
				...plainLinks.edges.filter(
					(edge) =>
						filePaths.has(edge.source) &&
						(filePaths.has(edge.target) ||
							edge.kind === 'unresolved-link'),
				),
			],
			unresolvedLinks,
			metadataSources,
		};
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
		const tags = normalizeTags([
			...toStringArray(frontmatter?.tags),
			...(cache?.tags ?? []).map((tag) => tag.tag),
		]);

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
			tags,
			links,
			embeds,
			noteType: firstString(frontmatter?.type),
			metadataFields,
			metadata: frontmatter ?? {},
		};
	}
}

export interface MetadataIndexRecord {
	path: string;
	node: KnowledgeNode;
	additionalNodes: KnowledgeNode[];
	edges: KnowledgeEdge[];
	unresolvedLinks: UnresolvedLink[];
	metadataSources: MetadataDebugEntry[];
}

export function createKnowledgeIndexFromMetadataRecords(
	records: Iterable<MetadataIndexRecord>,
): KnowledgeIndex {
	const index = createKnowledgeIndex();
	const values = [...records];
	for (const record of values) {
		addNode(index, record.node);
	}
	for (const record of values) {
		for (const node of record.additionalNodes) {
			addNode(index, node);
		}
	}
	for (const record of values) {
		for (const edge of record.edges) {
			addEdge(index, edge);
		}
	}
	return index;
}

function createPlainLinkEntries(
	file: TFile,
	cache: CachedMetadata | null,
	resolver: ObsidianLinkResolver,
): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
	const source = normalizePath(file.path);
	const nodes = new Map<string, KnowledgeNode>();
	const edges = new Map<string, KnowledgeEdge>();
	for (const link of cache?.links ?? []) {
		const targetPath = resolver.resolve(link.link, source);
		if (!targetPath) {
			const linkText = extractLinkText(link.link);
			if (!linkText) {
				continue;
			}
			const target = createUnresolvedNodeId(linkText);
			nodes.set(target, createUnresolvedNode(target, linkText));
			const id = createEdgeId(source, 'unresolved-link', target, true);
			edges.set(id, {
				id,
				kind: 'unresolved-link',
				semantic: false,
				source,
				target,
				relation: 'link',
				directed: true,
				sourcePath: source,
				sourceField: 'body',
			});
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
	return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function createUnresolvedNodeId(linkText: string): string {
	return `__unresolved__/${normalizePath(linkText)}`;
}

function createUnresolvedNode(id: string, linkText: string): KnowledgeNode {
	return {
		id,
		kind: 'unresolved',
		path: linkText,
		title: linkText.split('/').at(-1) ?? linkText,
		folder: '',
		domains: [],
		tags: [],
	};
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
