import type {
	ConnectionFieldMode,
	ConnectionFieldSpec,
} from '../../core/types';
import { DEFAULT_CONNECTION_FIELD_MODE } from './constants';
import { isRecord, uniqueStrings } from './utils';

export function normalizeConnectionFields(value: unknown): string[] {
	const fields = Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === 'string')
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
	return uniqueStrings(fields);
}

export function normalizeConnectionFieldSpecs(
	value: unknown,
	legacyFields: string[] = [],
	legacyModes: unknown = {},
): ConnectionFieldSpec[] {
	const records = Array.isArray(value) ? value : [];
	const specs = records
		.map((item) => normalizeConnectionFieldSpec(item))
		.filter((item): item is ConnectionFieldSpec => item !== undefined);
	const fallbackSpecs = legacyFields.map((field) =>
		createConnectionFieldSpec(
			field,
			readConnectionFieldMode(
				isRecord(legacyModes) ? legacyModes[field] : undefined,
			),
		),
	);
	return uniqueConnectionFieldSpecs(specs.length > 0 ? specs : fallbackSpecs);
}

export function normalizeConnectionFieldModes(
	value: unknown,
	fields: string[],
): Record<string, ConnectionFieldMode> {
	const record = isRecord(value) ? value : {};
	return Object.fromEntries(
		fields.map((field) => {
			const mode = readConnectionFieldMode(record[field]);
			return [field, mode];
		}),
	);
}

export function createConnectionFieldSpec(
	field: string,
	mode: ConnectionFieldMode,
): ConnectionFieldSpec {
	const normalized = field.trim();
	return {
		id: createConnectionFieldSpecId(normalized, mode),
		field: normalized,
		mode,
	};
}

function normalizeConnectionFieldSpec(
	value: unknown,
): ConnectionFieldSpec | undefined {
	const record = isRecord(value) ? value : {};
	const field = typeof record.field === 'string' ? record.field.trim() : '';
	if (!field) {
		return undefined;
	}
	const mode = readConnectionFieldMode(record.mode);
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createConnectionFieldSpecId(field, mode);
	return { id, field, mode };
}

function uniqueConnectionFieldSpecs(
	specs: ConnectionFieldSpec[],
): ConnectionFieldSpec[] {
	const seen = new Set<string>();
	const nextSpecs: ConnectionFieldSpec[] = [];
	for (const spec of specs) {
		const key = createConnectionFieldSpecId(spec.field, spec.mode);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		nextSpecs.push({
			...spec,
			id: spec.id || key,
		});
	}
	return nextSpecs;
}

function createConnectionFieldSpecId(
	field: string,
	mode: ConnectionFieldMode,
): string {
	return `${field}:${mode}`;
}

function readConnectionFieldMode(value: unknown): ConnectionFieldMode {
	return value === 'bidirectional' || value === 'reverse'
		? value
		: DEFAULT_CONNECTION_FIELD_MODE;
}
