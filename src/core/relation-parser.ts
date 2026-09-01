import { createEdgeId, normalizePath } from './knowledge-index';
import { extractLinkText, type LinkResolver } from './link-resolver';
import type { ConnectionFieldSpec, KnowledgeEdge } from './types';

interface RelationDefinition {
	field: string;
	relation: string;
	reverse: boolean;
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
	relationSpecs: ConnectionFieldSpec[] = [],
): KnowledgeEdge[] {
	if (!frontmatter) {
		return [];
	}

	const normalizedCurrentPath = normalizePath(currentPath);
	const edges = new Map<string, KnowledgeEdge>();

	for (const definition of createRelationDefinitions(
		relationFields,
		relationSpecs,
	)) {
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
			const source = definition.reverse
				? normalizedTargetPath
				: normalizedCurrentPath;
			const target = definition.reverse
				? normalizedCurrentPath
				: normalizedTargetPath;
			const id = createEdgeId(source, definition.relation, target, true);
			edges.set(id, {
				id,
				kind: 'relation',
				semantic: true,
				source,
				target,
				relation: definition.relation,
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
	relationSpecs: ConnectionFieldSpec[],
): RelationDefinition[] {
	const definitions: RelationDefinition[] = [];
	const seen = new Set<string>();
	const add = (definition: RelationDefinition): void => {
		const key = [
			normalizeFieldName(definition.field),
			definition.relation,
			definition.reverse ? 'reverse' : 'forward',
		].join(':');
		if (!seen.has(key)) {
			seen.add(key);
			definitions.push(definition);
		}
	};

	for (const spec of relationSpecs) {
		const field = spec.field.trim();
		if (!field) continue;
		add({ field, relation: field, reverse: false });
		if (spec.mode === 'paired' && spec.reverseField?.trim()) {
			add({
				field: spec.reverseField.trim(),
				relation: field,
				reverse: true,
			});
		}
	}

	if (relationSpecs.length === 0) {
		for (const rawField of relationFields) {
			const field = rawField.trim();
			if (field) add({ field, relation: field, reverse: false });
		}
	}
	return definitions;
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
