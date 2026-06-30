import { parseYaml, stringifyYaml } from 'obsidian';
import type { MetaGraphDocument } from '../core/types';
import {
	createDefaultMetaGraphDocument,
	META_GRAPH_FRONTMATTER_KEY,
	META_GRAPH_FRONTMATTER_VALUE,
	META_GRAPH_VERSION,
	META_GRAPH_VERSION_KEY,
	normalizeMetaGraphDocument,
} from './meta-graph-model';

export {
	META_GRAPH_FRONTMATTER_KEY,
	META_GRAPH_FRONTMATTER_VALUE,
	META_GRAPH_VERSION,
	META_GRAPH_VERSION_KEY,
} from './meta-graph-model';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;

export function createMetaGraphMarkdown(
	maxNodes: number,
	fadeDistance: number,
): string {
	return stringifyMetaGraphDocument(
		createDefaultMetaGraphDocument(maxNodes, fadeDistance),
	);
}

export function isMetaGraphMarkdown(data: string): boolean {
	return (
		readMetaGraphFrontmatter(data)[META_GRAPH_FRONTMATTER_KEY] ===
		META_GRAPH_FRONTMATTER_VALUE
	);
}

export function parseMetaGraphDocument(
	data: string,
	maxNodes: number,
	fadeDistance: number,
): MetaGraphDocument {
	const body = stripFrontmatter(data).trim();
	if (!body) {
		return createDefaultMetaGraphDocument(maxNodes, fadeDistance);
	}
	const parsed = parseYaml(body) as unknown;
	return normalizeMetaGraphDocument(parsed, maxNodes, fadeDistance);
}

export function stringifyMetaGraphDocument(
	document: MetaGraphDocument,
): string {
	const frontmatter = stringifyYaml({
		[META_GRAPH_FRONTMATTER_KEY]: META_GRAPH_FRONTMATTER_VALUE,
		[META_GRAPH_VERSION_KEY]: META_GRAPH_VERSION,
	}).trim();
	const body = stringifyYaml(document).trim();
	return `---\n${frontmatter}\n---\n\n${body}\n`;
}

function readMetaGraphFrontmatter(data: string): Record<string, unknown> {
	const match = FRONTMATTER_PATTERN.exec(data);
	if (!match?.[1]) {
		return {};
	}
	const parsed = parseYaml(match[1]) as unknown;
	return isRecord(parsed) ? parsed : {};
}

function stripFrontmatter(data: string): string {
	return data.replace(FRONTMATTER_PATTERN, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
