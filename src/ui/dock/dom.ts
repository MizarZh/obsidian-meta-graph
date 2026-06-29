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

export interface ViewportPoint {
	x: number;
	y: number;
}

export function readViewportPoint(
	container: HTMLElement,
	clientX: number,
	clientY: number,
): ViewportPoint {
	const rect = container.getBoundingClientRect();
	return {
		x: clientX - rect.left,
		y: clientY - rect.top,
	};
}

export function readElementCenterViewportPosition(
	container: HTMLElement,
	element: HTMLElement,
): ViewportPoint {
	const elementRect = element.getBoundingClientRect();
	return readViewportPoint(
		container,
		elementRect.left + elementRect.width / 2,
		elementRect.top + elementRect.height / 2,
	);
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
