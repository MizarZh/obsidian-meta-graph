import { parseYaml, stringifyYaml } from 'obsidian';
import type { MetaGraphDocument } from '../core/types';
import {
	createDefaultMetaGraphDocumentV2,
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
} from './meta-graph-v2/codec';
import type {
	ParsedMetaGraphWorkspace,
	PersistedMetaGraphDocumentV2,
} from './meta-graph-v2/types';
import {
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
		createDefaultMetaGraphDocumentV2(maxNodes, fadeDistance),
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
	return parseMetaGraphWorkspace(data, maxNodes, fadeDistance).document;
}

export function parseMetaGraphWorkspace(
	data: string,
	maxNodes: number,
	fadeDistance: number,
): ParsedMetaGraphWorkspace {
	const frontmatter = readMetaGraphFrontmatter(data);
	const version = readDocumentVersion(frontmatter);
	const body = stripFrontmatter(data).trim();
	if (!body) {
		return parsePersistedMetaGraphDocumentV2(
			createDefaultMetaGraphDocumentV2(maxNodes, fadeDistance),
			maxNodes,
			fadeDistance,
		);
	}
	const parsed = parseYaml(body) as unknown;
	if (version <= 1) {
		const document = normalizeMetaGraphDocument(
			parsed,
			maxNodes,
			fadeDistance,
		);
		const persistence = createPersistenceContextFromV1(document);
		for (const chart of document.charts) {
			chart.templateOverrides = Object.fromEntries(
				Object.entries(
					persistence.templateOverridesByChart[chart.id] ?? {},
				).map(([templateId, override]) => [
					templateId,
					{ defaultGroupId: override.defaultGroup },
				]),
			);
		}
		return {
			document,
			persistence,
		};
	}
	return parsePersistedMetaGraphDocumentV2(parsed, maxNodes, fadeDistance, {
		sourceVersion: version,
		readOnly: version > META_GRAPH_VERSION,
	});
}

export function stringifyMetaGraphDocument(
	document: PersistedMetaGraphDocumentV2,
): string {
	const frontmatter = stringifyYaml({
		[META_GRAPH_FRONTMATTER_KEY]: META_GRAPH_FRONTMATTER_VALUE,
		[META_GRAPH_VERSION_KEY]: META_GRAPH_VERSION,
	}).trim();
	const body = stringifyYaml(document).trim();
	return `---\n${frontmatter}\n---\n\n${body}\n`;
}

function readDocumentVersion(frontmatter: Record<string, unknown>): number {
	const value = frontmatter[META_GRAPH_VERSION_KEY];
	if (value === undefined) {
		return 1;
	}
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error('meta-graph-version must be a positive integer.');
	}
	return value;
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
