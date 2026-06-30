import type {
	GraphQuery,
	NodeFilterCondition,
	NodeFilterGroup,
	NodeFilterItem,
	NodeFilterRule,
} from '../../core/types';
import { DEFAULT_GRAPH_QUERY } from '../../query/graph-query';
import { cloneSerializable } from '../state/persistence';
import {
	createRuleId,
	isRecord,
	readFilterField,
	readFilterGroupMode,
	readFilterOperator,
	readFiniteNumber,
} from './utils';

export function normalizeQuery(
	value: unknown,
	fallback: GraphQuery,
	maxNodes: number,
): GraphQuery {
	const record = isRecord(value) ? value : {};
	const hiddenNodeRules = normalizeFilterRules(record.hiddenNodeRules);
	const filterRoot = normalizeFilterRoot(record.filterRoot, hiddenNodeRules);
	return {
		...fallback,
		...cloneSerializable(record),
		hiddenNodeRules,
		filterRoot,
		maxNodes: readFiniteNumber(record.maxNodes, maxNodes),
	};
}

export function normalizeFilterRoot(
	value: unknown,
	legacyRules: NodeFilterRule[],
): NodeFilterGroup {
	const normalized = normalizeFilterGroup(value, true);
	if (normalized) {
		return normalized;
	}
	return migrateLegacyFilterRules(legacyRules);
}

export function normalizeFilterGroup(
	value: unknown,
	root = false,
): NodeFilterGroup | undefined {
	if (!isRecord(value) || value.kind !== 'group') {
		return undefined;
	}
	const id =
		root || typeof value.id !== 'string' || !value.id.trim()
			? 'root'
			: value.id.trim();
	const mode = readFilterGroupMode(value.mode);
	const children = Array.isArray(value.children)
		? value.children
				.map((child) => normalizeFilterItem(child))
				.filter((child): child is NodeFilterItem => child !== undefined)
		: [];
	return {
		id,
		kind: 'group',
		mode,
		children,
	};
}

function normalizeFilterItem(value: unknown): NodeFilterItem | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	if (value.kind === 'group') {
		return normalizeFilterGroup(value);
	}
	if (value.kind === 'condition') {
		return normalizeFilterCondition(value);
	}
	return undefined;
}

function normalizeFilterCondition(
	value: Record<string, unknown>,
): NodeFilterCondition | undefined {
	const field = readFilterField(value.field);
	if (!field) {
		return undefined;
	}
	return {
		id:
			typeof value.id === 'string' && value.id.trim()
				? value.id.trim()
				: createRuleId(),
		kind: 'condition',
		field,
		operator: readFilterOperator(value.operator),
		value: typeof value.value === 'string' ? value.value : '',
	};
}

function normalizeFilterRules(value: unknown): NodeFilterRule[] {
	return Array.isArray(value)
		? value
				.map((item) => normalizeFilterRule(item))
				.filter((item): item is NodeFilterRule => item !== undefined)
		: [];
}

function normalizeFilterRule(value: unknown): NodeFilterRule | undefined {
	const record = isRecord(value) ? value : {};
	const field = readFilterField(record.field);
	if (!field) {
		return undefined;
	}
	return {
		id:
			typeof record.id === 'string' && record.id.trim()
				? record.id.trim()
				: createRuleId(),
		action: record.action === 'hide' ? 'hide' : 'show',
		field,
		operator: readFilterOperator(record.operator),
		value: typeof record.value === 'string' ? record.value : '',
	};
}

function migrateLegacyFilterRules(rules: NodeFilterRule[]): NodeFilterGroup {
	const showRules = rules.filter((rule) => rule.action === 'show');
	const hideRules = rules.filter((rule) => rule.action === 'hide');
	const children: NodeFilterItem[] = [];
	if (showRules.length > 0) {
		children.push({
			id: createRuleId(),
			kind: 'group',
			mode: 'all',
			children: showRules.map(legacyRuleToCondition),
		});
	}
	if (hideRules.length > 0) {
		children.push({
			id: createRuleId(),
			kind: 'group',
			mode: 'none',
			children: hideRules.map(legacyRuleToCondition),
		});
	}
	return {
		id: 'root',
		kind: 'group',
		mode: 'all',
		children,
	};
}

function legacyRuleToCondition(rule: NodeFilterRule): NodeFilterCondition {
	return {
		id: rule.id,
		kind: 'condition',
		field: rule.field,
		operator: rule.operator,
		value: rule.value,
	};
}

export function createDefaultQuery(maxNodes: number, type: string): GraphQuery {
	return {
		...DEFAULT_GRAPH_QUERY,
		relations:
			type === 'flow'
				? ['prerequisite', 'leads-to']
				: [...DEFAULT_GRAPH_QUERY.relations],
		maxNodes,
	};
}

export function createDefaultGlobalQuery(maxNodes: number): GraphQuery {
	return {
		...DEFAULT_GRAPH_QUERY,
		roots: [],
		folders: [],
		tags: [],
		hiddenNodeRules: [],
		domains: [],
		relations: [],
		maxNodes,
	};
}
