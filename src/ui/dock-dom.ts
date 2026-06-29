export interface DockDropTarget {
	notePath?: string;
	templateId?: string;
	curated: boolean;
}

export function readElementAtPoint(
	document: Document,
	clientX: number,
	clientY: number,
): Element | null {
	return document.elementFromPoint(clientX, clientY);
}

export function readDockDropTarget(target: EventTarget | null): DockDropTarget {
	return {
		notePath: readDockNotePathFromTarget(target),
		templateId: readDockTemplateIdFromTarget(target),
		curated: readCuratedDropTarget(target),
	};
}

export function readDockNotePathFromTarget(
	target: EventTarget | null,
): string | undefined {
	if (!(target instanceof HTMLElement)) {
		return undefined;
	}
	const noteEl = target.closest<HTMLElement>('[data-dock-note-path]');
	return noteEl?.dataset.dockNotePath || undefined;
}

export function readDockTemplateIdFromTarget(
	target: EventTarget | null,
): string | undefined {
	if (!(target instanceof HTMLElement)) {
		return undefined;
	}
	const templateEl = target.closest<HTMLElement>('[data-dock-template-id]');
	return templateEl?.dataset.dockTemplateId || undefined;
}

export function readCuratedDropTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	return Boolean(target.closest('[data-curated-drop-target]'));
}
