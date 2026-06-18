import { createEdgeId, normalizePath } from './knowledge-index';
import { extractLinkText, type LinkResolver } from './link-resolver';
import type { KnowledgeEdge, RelationType } from './types';

interface RelationDefinition {
	fields: string[];
	relation: RelationType;
	directed: boolean;
	reverse: boolean;
}

export interface CachedFrontmatterLink {
	key: string;
	link: string;
}

const RELATIONS: RelationDefinition[] = [
	{
		fields: ['prerequisites', 'prerequisite'],
		relation: 'prerequisite',
		directed: true,
		reverse: true,
	},
	{
		fields: ['leads_to', 'leads-to', 'leadsTo'],
		relation: 'leads-to',
		directed: true,
		reverse: false,
	},
	{
		fields: ['related'],
		relation: 'related',
		directed: false,
		reverse: false,
	},
];

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
): KnowledgeEdge[] {
	if (!frontmatter) {
		return [];
	}

	const normalizedCurrentPath = normalizePath(currentPath);
	const edges = new Map<string, KnowledgeEdge>();

	for (const definition of RELATIONS) {
		const values = getRelationValues(frontmatter, frontmatterLinks, definition);
		for (const { value, sourceField } of values) {
			const linkText = extractLinkText(value);
			if (!linkText) {
				continue;
			}
			const targetPath = resolver.resolve(linkText, normalizedCurrentPath);
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
			const id = createEdgeId(
				source,
				definition.relation,
				target,
				definition.directed,
			);
			edges.set(id, {
				id,
				source,
				target,
				relation: definition.relation,
				directed: definition.directed,
				sourcePath: normalizedCurrentPath,
				sourceField,
			});
		}
	}

	return [...edges.values()];
}

export function isRelationField(field: string): boolean {
	const normalized = normalizeFieldName(field);
	return RELATIONS.some((definition) =>
		definition.fields.some(
			(candidate) => normalizeFieldName(candidate) === normalized,
		),
	);
}

function getRelationValues(
	frontmatter: Record<string, unknown>,
	frontmatterLinks: CachedFrontmatterLink[],
	definition: RelationDefinition,
): Array<{ value: string; sourceField: string }> {
	const values: Array<{ value: string; sourceField: string }> = [];
	const normalizedFields = new Set(
		definition.fields.map((field) => normalizeFieldName(field)),
	);

	for (const [field, rawValue] of Object.entries(frontmatter)) {
		if (!normalizedFields.has(normalizeFieldName(field))) {
			continue;
		}
		for (const value of toStringArray(rawValue)) {
			values.push({ value, sourceField: field });
		}
	}

	for (const link of frontmatterLinks) {
		const sourceField = getRootField(link.key);
		if (normalizedFields.has(normalizeFieldName(sourceField))) {
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
