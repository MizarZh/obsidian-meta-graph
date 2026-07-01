import type { DockTemplateNode, MetaGraphDock, NodeId } from '../../core/types';
import {
	normalizeDockNotes,
	normalizeDockTemplates,
} from '../meta-graph-model';
import { createDockId } from '../meta-graph/utils';

export type ReorderPlacement = 'before' | 'after';

export function addDockTemplate(
	dock: MetaGraphDock,
	template: Omit<DockTemplateNode, 'id'> & { id?: string },
): MetaGraphDock {
	return {
		...dock,
		templates: normalizeDockTemplates([
			...dock.templates,
			{
				...template,
				id: template.id ?? createDockId('template', template.label),
			},
		]),
	};
}

export function updateDockTemplate(
	dock: MetaGraphDock,
	templateId: string,
	patch: Omit<DockTemplateNode, 'id'>,
): MetaGraphDock {
	if (!dock.templates.some((template) => template.id === templateId)) {
		return dock;
	}
	return {
		...dock,
		templates: normalizeDockTemplates(
			dock.templates.map((template) =>
				template.id === templateId
					? {
							...template,
							...patch,
							id: template.id,
						}
					: template,
			),
		),
	};
}

export function removeDockTemplate(
	dock: MetaGraphDock,
	templateId: string,
): MetaGraphDock {
	const templates = dock.templates.filter(
		(template) => template.id !== templateId,
	);
	return templates.length === dock.templates.length
		? dock
		: { ...dock, templates };
}

export function reorderDockTemplate(
	dock: MetaGraphDock,
	templateId: string,
	targetTemplateId: string,
	placement: ReorderPlacement,
): MetaGraphDock {
	const templates = moveRelative(
		dock.templates,
		(template) => template.id === templateId,
		(template) => template.id === targetTemplateId,
		placement,
	);
	return templates === dock.templates ? dock : { ...dock, templates };
}

export function reorderDockTemplates(
	dock: MetaGraphDock,
	orderedTemplateIds: string[],
): MetaGraphDock {
	const templates = reorderByIds(
		dock.templates,
		orderedTemplateIds,
		(template) => template.id,
	);
	return templates === dock.templates ? dock : { ...dock, templates };
}

export function addDockNote(dock: MetaGraphDock, path: NodeId): MetaGraphDock {
	return {
		...dock,
		notes: normalizeDockNotes([
			...dock.notes,
			{ id: createDockId('note', path), path },
		]),
	};
}

export function removeDockNote(
	dock: MetaGraphDock,
	path: NodeId,
): MetaGraphDock {
	const notes = dock.notes.filter((note) => note.path !== path);
	return notes.length === dock.notes.length ? dock : { ...dock, notes };
}

export function reorderDockNote(
	dock: MetaGraphDock,
	path: NodeId,
	targetPath: NodeId,
	placement: ReorderPlacement,
): MetaGraphDock {
	const notes = moveRelative(
		dock.notes,
		(note) => note.path === path,
		(note) => note.path === targetPath,
		placement,
	);
	return notes === dock.notes ? dock : { ...dock, notes };
}

export function reorderDockNotes(
	dock: MetaGraphDock,
	orderedPaths: NodeId[],
): MetaGraphDock {
	const notes = reorderByIds(dock.notes, orderedPaths, (note) => note.path);
	return notes === dock.notes ? dock : { ...dock, notes };
}

export function updateDockNotePath(
	dock: MetaGraphDock,
	oldPath: NodeId,
	newPath: NodeId,
): MetaGraphDock {
	let changed = false;
	const notes = dock.notes.map((note) => {
		if (note.path !== oldPath) {
			return note;
		}
		changed = true;
		return { ...note, path: newPath };
	});
	return changed ? { ...dock, notes } : dock;
}

export function setDockWidth(
	dock: MetaGraphDock,
	dockWidth: number,
): MetaGraphDock {
	return dock.dockWidth === dockWidth ? dock : { ...dock, dockWidth };
}

export function setCuratedPanelWidth(
	dock: MetaGraphDock,
	curatedPanelWidth: number,
): MetaGraphDock {
	return dock.curatedPanelWidth === curatedPanelWidth
		? dock
		: { ...dock, curatedPanelWidth };
}

export function setDockFocusOnSelect(
	dock: MetaGraphDock,
	focusOnSelect: boolean,
): MetaGraphDock {
	return dock.focusOnSelect === focusOnSelect
		? dock
		: { ...dock, focusOnSelect };
}

export function moveRelative<T>(
	items: T[],
	matchMoved: (item: T) => boolean,
	matchTarget: (item: T) => boolean,
	placement: ReorderPlacement,
): T[] {
	const fromIndex = items.findIndex(matchMoved);
	const toIndex = items.findIndex(matchTarget);
	if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
		return items;
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1) as [T];
	const targetIndex = next.findIndex(matchTarget);
	if (targetIndex < 0) {
		return items;
	}
	next.splice(
		placement === 'after' ? targetIndex + 1 : targetIndex,
		0,
		moved,
	);
	if (next.every((item, index) => item === items[index])) {
		return items;
	}
	return next;
}

function reorderByIds<T>(
	items: T[],
	orderedIds: string[],
	getId: (item: T) => string,
): T[] {
	const orderedIdSet = new Set(orderedIds);
	if (orderedIdSet.size !== items.length) {
		return items;
	}
	const itemsById = new Map(items.map((item) => [getId(item), item]));
	const orderedItems = orderedIds.map((id) => itemsById.get(id));
	if (orderedItems.some((item) => item === undefined)) {
		return items;
	}
	if (orderedItems.every((item, index) => item === items[index])) {
		return items;
	}
	return orderedItems as T[];
}
