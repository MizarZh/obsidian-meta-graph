import type {
	ChartGroupDefinition,
	ChartGroupingConfig,
	ManualLayoutConfig,
} from '../../core/types';
import { normalizeFilterGroup } from './query';
import {
	createDockId,
	isRecord,
	normalizeTextPath,
	readFiniteNumber,
	uniqueById,
} from './utils';

export function createDefaultChartGrouping(): ChartGroupingConfig {
	return { groups: [], overrides: {} };
}

export function normalizeChartGrouping(
	value: unknown,
	legacyManual?: ManualLayoutConfig,
	fallback: ChartGroupingConfig = createDefaultChartGrouping(),
): ChartGroupingConfig {
	const record = isRecord(value) ? value : undefined;
	const normalizedGroups = Array.isArray(record?.groups)
		? record.groups
				.map((group, index) => normalizeGroupDefinition(group, index))
				.filter(
					(group): group is ChartGroupDefinition =>
						group !== undefined,
				)
		: legacyManual?.groups.map(toGroupDefinition);
	const groups = uniqueById(
		normalizedGroups ?? fallback.groups.map((group) => ({ ...group })),
	);
	const validGroupIds = new Set(groups.map((group) => group.id));
	const overrides = isRecord(record?.overrides)
		? normalizeOverrides(record.overrides, validGroupIds)
		: legacyManual
			? migrateLegacyOverrides(legacyManual, validGroupIds)
			: normalizeOverrides(fallback.overrides, validGroupIds);
	return { groups, overrides };
}

export function toGroupDefinition(
	group: ChartGroupDefinition,
): ChartGroupDefinition {
	return {
		id: group.id,
		name: group.name,
		color: group.color,
		mode: group.mode,
		shape: group.shape ?? 'auto',
		padding: group.padding,
		...(group.rule ? { rule: group.rule } : {}),
	};
}

function normalizeGroupDefinition(
	value: unknown,
	index: number,
): ChartGroupDefinition | undefined {
	const record = isRecord(value) ? value : undefined;
	if (!record) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('group', `${index + 1}`);
	return {
		id,
		name:
			typeof record.name === 'string' && record.name.trim()
				? record.name.trim()
				: `Group ${index + 1}`,
		color:
			typeof record.color === 'string' && record.color.trim()
				? record.color.trim()
				: '#7c6ff0',
		mode: record.mode === 'rule' ? 'rule' : 'manual',
		shape:
			record.shape === 'circle' || record.shape === 'rectangle'
				? record.shape
				: 'auto',
		padding: Math.max(0, readFiniteNumber(record.padding, 0.32)),
		...(isRecord(record.rule)
			? { rule: normalizeFilterGroup(record.rule) }
			: {}),
	};
}

function normalizeOverrides(
	record: Record<string, unknown>,
	validGroupIds: ReadonlySet<string>,
): ChartGroupingConfig['overrides'] {
	const overrides: ChartGroupingConfig['overrides'] = {};
	for (const [path, value] of Object.entries(record)) {
		if (value === null) {
			overrides[normalizeTextPath(path)] = null;
		} else if (
			typeof value === 'string' &&
			value.trim() &&
			validGroupIds.has(value.trim())
		) {
			overrides[normalizeTextPath(path)] = value.trim();
		}
	}
	return overrides;
}

function migrateLegacyOverrides(
	manual: ManualLayoutConfig,
	validGroupIds: ReadonlySet<string>,
): ChartGroupingConfig['overrides'] {
	const overrides: ChartGroupingConfig['overrides'] = {};
	for (const [path, placement] of Object.entries(manual.nodes)) {
		if (placement.groupId && validGroupIds.has(placement.groupId)) {
			overrides[normalizeTextPath(path)] = placement.groupId;
		}
	}
	return overrides;
}
