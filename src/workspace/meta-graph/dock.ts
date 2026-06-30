import type {
	DockConnectionDirection,
	DockNoteNode,
	DockTemplateNode,
	MetaGraphDock,
} from '../../core/types';
import { DEFAULT_CONNECTION_FIELD } from './constants';
import {
	createDockId,
	isRecord,
	normalizeTextPath,
	readFiniteNumber,
	uniqueById,
	uniqueByPath,
} from './utils';

export function normalizeDock(value: unknown): MetaGraphDock {
	const record = isRecord(value) ? value : {};
	return {
		templates: normalizeDockTemplates(record.templates),
		notes: normalizeDockNotes(record.notes),
		dockWidth: readFiniteNumber(record.dockWidth, 280),
		curatedPanelWidth: readFiniteNumber(record.curatedPanelWidth, 300),
		focusOnSelect: record.focusOnSelect !== false,
	};
}

export function normalizeDockTemplates(value: unknown): DockTemplateNode[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueById(
		records
			.map((item, index) => normalizeDockTemplate(item, index))
			.filter((item): item is DockTemplateNode => item !== undefined),
	);
}

export function normalizeDockNotes(value: unknown): DockNoteNode[] {
	const records = Array.isArray(value) ? value : [];
	return uniqueByPath(
		records
			.map((item, index) => normalizeDockNote(item, index))
			.filter((item): item is DockNoteNode => item !== undefined),
	);
}

function normalizeDockTemplate(
	value: unknown,
	index: number,
): DockTemplateNode | undefined {
	const record = isRecord(value) ? value : {};
	const label =
		typeof record.label === 'string' && record.label.trim()
			? record.label.trim()
			: undefined;
	if (!label) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('template', `${label}-${index}`);
	const direction = normalizeDockDirection(record.direction);
	return {
		id,
		label,
		templatePath:
			typeof record.templatePath === 'string'
				? normalizeTextPath(record.templatePath)
				: '',
		targetFolder:
			typeof record.targetFolder === 'string'
				? normalizeTextPath(record.targetFolder).replace(/\/$/u, '')
				: '',
		relationField:
			typeof record.relationField === 'string' &&
			record.relationField.trim()
				? record.relationField.trim()
				: DEFAULT_CONNECTION_FIELD,
		direction,
		defaultGroupId:
			typeof record.defaultGroupId === 'string' &&
			record.defaultGroupId.trim()
				? record.defaultGroupId.trim()
				: undefined,
	};
}

function normalizeDockNote(
	value: unknown,
	index: number,
): DockNoteNode | undefined {
	const record = isRecord(value) ? value : {};
	const path =
		typeof record.path === 'string' && record.path.trim()
			? normalizeTextPath(record.path)
			: undefined;
	if (!path) {
		return undefined;
	}
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('note', `${path}-${index}`);
	return { id, path };
}

function normalizeDockDirection(value: unknown): DockConnectionDirection {
	return value === 'from-dock-to-graph'
		? 'from-dock-to-graph'
		: 'from-graph-to-dock';
}
