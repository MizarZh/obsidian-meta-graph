import { createEdgeId, normalizePath } from './knowledge-index';
import { extractLinkText, type LinkResolver } from './link-resolver';
import type { KnowledgeEdge } from './types';

interface RelationDefinition {
	field: string;
}

export interface CachedFrontmatterLink {
	key: string;
	link: string;
}

export function toStringArray(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values
		.filter((item): item is string => typeof item === 'string')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function parseRelations(
	frontmatter: Record<string, unknown> | undefined,
	currentPath: string,
	resolver: LinkResolver,
	onUnresolved?: (linkText: string, sourcePath: string) => void,
	frontmatterLinks: CachedFrontmatterLink[] = [],
	relationFields: string[] = [],
): KnowledgeEdge[] {
	if (!frontmatter) {
		return [];
	}

	const normalizedCurrentPath = normalizePath(currentPath);
	const edges = new Map<string, KnowledgeEdge>();

	for (const definition of createRelationDefinitions(relationFields)) {
		const values = getRelationValues(
			frontmatter,
			frontmatterLinks,
			definition,
		);
		for (const { value, sourceField } of values) {
			const linkText = extractLinkText(value);
			if (!linkText) {
				continue;
			}
			const targetPath = resolver.resolve(
				linkText,
				normalizedCurrentPath,
			);
			if (!targetPath) {
				onUnresolved?.(linkText, normalizedCurrentPath);
				continue;
			}

			const normalizedTargetPath = normalizePath(targetPath);
			const source = normalizedCurrentPath;
			const target = normalizedTargetPath;
			const id = createEdgeId(source, definition.field, target, true);
			edges.set(id, {
				id,
				source,
				target,
				relation: definition.field,
				directed: true,
				sourcePath: normalizedCurrentPath,
				sourceField,
			});
		}
	}

	return [...edges.values()];
}

export function isRelationField(
	field: string,
	relationFields: string[] = [],
): boolean {
	const normalized = normalizeFieldName(field);
	return relationFields.some(
		(candidate) => normalizeFieldName(candidate) === normalized,
	);
}

function createRelationDefinitions(
	relationFields: string[],
): RelationDefinition[] {
	return relationFields
		.map((field) => field.trim())
		.filter(Boolean)
		.map((field) => ({ field }));
}

function getRelationValues(
	frontmatter: Record<string, unknown>,
	frontmatterLinks: CachedFrontmatterLink[],
	definition: RelationDefinition,
): Array<{ value: string; sourceField: string }> {
	const values: Array<{ value: string; sourceField: string }> = [];
	const normalizedField = normalizeFieldName(definition.field);

	for (const [field, rawValue] of Object.entries(frontmatter)) {
		if (normalizeFieldName(field) !== normalizedField) {
			continue;
		}
		for (const value of toStringArray(rawValue)) {
			values.push({ value, sourceField: field });
		}
	}

	for (const link of frontmatterLinks) {
		const sourceField = getRootField(link.key);
		if (normalizeFieldName(sourceField) === normalizedField) {
			values.push({ value: link.link, sourceField });
		}
	}

	return values;
}

function getRootField(key: string): string {
	return key.split(/[.[\]]/u)[0] ?? key;
}

function normalizeFieldName(field: string): string {
	return field.toLocaleLowerCase().replace(/[^a-z0-9]/gu, '');
}
