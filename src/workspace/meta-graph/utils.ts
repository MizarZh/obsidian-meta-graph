import type {
	LabelPosition,
	LinkLineStyle,
	NodeFilterField,
	NodeFilterGroupMode,
	NodeFilterOperator,
} from '../../core/types';
import { cloneSerializable } from '../state/persistence';

const FILTER_FIELDS = new Set<string>([
	'file.file',
	'file.name',
	'file.basename',
	'file.fullname',
	'file.path',
	'file.folder',
	'file.ext',
	'file.ctime',
	'file.mtime',
	'file.size',
	'file.links',
	'file.embeds',
	'file.tags',
	'aliases',
	'metadata-field',
	'folder',
	'tag',
]);

const FILTER_OPERATORS = new Set<string>([
	'has-value',
	'empty',
	'is',
	'is-not',
	'contains',
	'does-not-contain',
	'links-to',
	'in-folder',
	'has-tag',
	'has-property',
	'does-not-link-to',
	'is-not-in-folder',
	'does-not-have-tag',
	'does-not-have-property',
	'starts-with',
	'ends-with',
	'is-empty',
	'is-not-empty',
	'contains-any-of',
	'contains-all-of',
	'does-not-start-with',
	'does-not-end-with',
	'does-not-contain-any-of',
	'does-not-contain-all-of',
	'on',
	'not-on',
	'before',
	'on-or-before',
	'after',
	'on-or-after',
	'eq',
	'neq',
	'lt',
	'lte',
	'gt',
	'gte',
	'is-exactly',
	'is-not-exactly',
]);

export function normalizeArray<T>(value: unknown): T[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((item) => cloneSerializable(item) as T);
}

export function readFiniteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function readStyleColor(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function readOptionalStyleColor(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readStyleLabel(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function readOptionalStyleLabel(value: unknown): string | undefined {
	return typeof value === 'string' ? value.trim() : undefined;
}

export function readOptionalFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export function readLinkLineStyle(
	value: unknown,
	fallback: LinkLineStyle,
): LinkLineStyle {
	const optional = readOptionalLinkLineStyle(value);
	return optional ?? fallback;
}

export function readOptionalLinkLineStyle(
	value: unknown,
): LinkLineStyle | undefined {
	return value === 'solid' || value === 'dashed' || value === 'dotted'
		? value
		: undefined;
}

export function readFilterField(value: unknown): NodeFilterField | undefined {
	if (typeof value !== 'string' || !value.trim()) {
		return undefined;
	}
	const field = value.trim();
	if (field.startsWith('metadata.')) {
		return field as NodeFilterField;
	}
	return FILTER_FIELDS.has(field) ? (field as NodeFilterField) : undefined;
}

export function readFilterOperator(
	value: unknown,
): NodeFilterOperator | undefined {
	return typeof value === 'string' && FILTER_OPERATORS.has(value)
		? (value as NodeFilterOperator)
		: undefined;
}

export function readFilterGroupMode(value: unknown): NodeFilterGroupMode {
	return value === 'any' || value === 'none' ? value : 'all';
}

export function readLabelPosition(
	value: unknown,
	fallback: LabelPosition,
): LabelPosition {
	return value === 'right' ||
		value === 'left' ||
		value === 'top' ||
		value === 'bottom'
		? value
		: fallback;
}

export function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createRuleId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeTextPath(value: string): string {
	return value.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
}

export function createDockId(prefix: string, value: string): string {
	const slug = value
		.trim()
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return `${prefix}-${slug || Date.now().toString(36)}`;
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of items) {
		if (seen.has(item.id)) {
			continue;
		}
		seen.add(item.id);
		result.push(item);
	}
	return result;
}

export function uniqueByPath<T extends { path: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of items) {
		if (seen.has(item.path)) {
			continue;
		}
		seen.add(item.path);
		result.push(item);
	}
	return result;
}
