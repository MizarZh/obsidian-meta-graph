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
			readLegacyConnectionFieldMode(
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
	reverseField?: string,
): ConnectionFieldSpec {
	const normalized = field.trim();
	const normalizedReverse = reverseField?.trim();
	return {
		id: createConnectionFieldSpecId(normalized, mode, normalizedReverse),
		field: normalized,
		mode,
		...(mode === 'paired' && normalizedReverse
			? { reverseField: normalizedReverse }
			: {}),
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
	const reverseField =
		typeof record.reverseField === 'string'
			? record.reverseField.trim()
			: '';
	if (mode === 'paired' && (!reverseField || reverseField === field)) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createConnectionFieldSpecId(field, mode, reverseField);
	return {
		id,
		field,
		mode,
		...(mode === 'paired' ? { reverseField } : {}),
	};
}

function uniqueConnectionFieldSpecs(
	specs: ConnectionFieldSpec[],
): ConnectionFieldSpec[] {
	const seen = new Set<string>();
	const nextSpecs: ConnectionFieldSpec[] = [];
	for (const spec of specs) {
		if (
			spec.mode === 'paired' &&
			(!spec.reverseField?.trim() ||
				spec.reverseField.trim() === spec.field)
		) {
			continue;
		}
		const key = createConnectionFieldSpecId(
			spec.field,
			spec.mode,
			spec.reverseField,
		);
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

export function createConnectionFieldSpecId(
	field: string,
	mode: ConnectionFieldMode,
	reverseField?: string,
): string {
	return mode === 'paired'
		? `${field.trim()}:paired:${reverseField?.trim() ?? ''}`
		: `${field.trim()}:${mode}`;
}

function readConnectionFieldMode(value: unknown): ConnectionFieldMode {
	return value === 'bidirectional' ||
		value === 'reverse' ||
		value === 'paired'
		? value
		: DEFAULT_CONNECTION_FIELD_MODE;
}

function readLegacyConnectionFieldMode(value: unknown): ConnectionFieldMode {
	const mode = readConnectionFieldMode(value);
	return mode === 'paired' ? DEFAULT_CONNECTION_FIELD_MODE : mode;
}
