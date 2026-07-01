import type {
	CuratedWorkspaceConfig,
	CuratedWorkspaceContext,
	CuratedWorkspaceFile,
} from '../../core/types';
import { DEFAULT_CURATED_CONTEXT } from './constants';
import {
	isRecord,
	normalizeTextPath,
	readBoolean,
	readFiniteNumber,
	readOptionalFiniteNumber,
	uniqueByPath,
} from './utils';

export function createDefaultCuratedWorkspace(): CuratedWorkspaceConfig {
	return {
		files: [],
		context: { ...DEFAULT_CURATED_CONTEXT },
	};
}

export function normalizeCuratedWorkspace(
	value: unknown,
): CuratedWorkspaceConfig {
	const record = isRecord(value) ? value : {};
	return {
		files: normalizeCuratedFiles(record.files),
		context: normalizeCuratedContext(record.context),
	};
}

function normalizeCuratedFiles(value: unknown): CuratedWorkspaceFile[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueByPath(
		records
			.map((item) => normalizeCuratedFile(item))
			.filter((item): item is CuratedWorkspaceFile => item !== undefined),
	);
}

function normalizeCuratedFile(
	value: unknown,
): CuratedWorkspaceFile | undefined {
	const record = isRecord(value) ? value : {};
	const rawPath =
		typeof record.path === 'string' && record.path.trim()
			? record.path
			: typeof value === 'string' && value.trim()
				? value
				: undefined;
	if (!rawPath) {
		return undefined;
	}
	const result: CuratedWorkspaceFile = {
		path: normalizeTextPath(rawPath),
	};
	const groupId =
		typeof record.groupId === 'string' && record.groupId.trim()
			? record.groupId.trim()
			: typeof record.group === 'string' && record.group.trim()
				? record.group.trim()
				: undefined;
	if (groupId) {
		result.groupId = groupId;
	}
	if (typeof record.note === 'string' && record.note.trim()) {
		result.note = record.note.trim();
	}
	if (readBoolean(record.hidden, false)) {
		result.hidden = true;
	}
	const x = readOptionalFiniteNumber(record.x);
	const y = readOptionalFiniteNumber(record.y);
	if (x !== undefined) {
		result.x = x;
	}
	if (y !== undefined) {
		result.y = y;
	}
	return result;
}

function normalizeCuratedContext(value: unknown): CuratedWorkspaceContext {
	const record = isRecord(value) ? value : {};
	return {
		enabled: readBoolean(record.enabled, DEFAULT_CURATED_CONTEXT.enabled),
		depth: Math.max(
			0,
			Math.floor(
				readFiniteNumber(record.depth, DEFAULT_CURATED_CONTEXT.depth),
			),
		),
		includeOutgoingLinks: readBoolean(
			record.includeOutgoingLinks,
			DEFAULT_CURATED_CONTEXT.includeOutgoingLinks,
		),
		includeBacklinks: readBoolean(
			record.includeBacklinks,
			DEFAULT_CURATED_CONTEXT.includeBacklinks,
		),
		includeMetadataRelations: readBoolean(
			record.includeMetadataRelations,
			DEFAULT_CURATED_CONTEXT.includeMetadataRelations,
		),
	};
}
