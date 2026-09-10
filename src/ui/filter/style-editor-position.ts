/** Convert viewport measurements to the editor's workspace containing block. */
export function placeStyleEditorInWorkspace(
	anchor: { left: number; right: number; top: number },
	workspace: { left: number; top: number; width: number; height: number },
	width: number,
	height: number,
) {
	const scaleX = workspace.width > 0 ? width / workspace.width : 1;
	const scaleY = workspace.height > 0 ? height / workspace.height : 1;
	return placeStyleEditor(
		{
			left: (anchor.left - workspace.left) * scaleX,
			right: (anchor.right - workspace.left) * scaleX,
			top: (anchor.top - workspace.top) * scaleY,
		},
		width,
		height,
	);
}

/** Align to the clicked card, shrinking height before shifting away from it. */
export function placeStyleEditor(
	panel: { left: number; right: number; top: number },
	viewportWidth: number,
	viewportHeight: number,
) {
	const margin = 12;
	const gap = 8;
	const width = Math.min(440, Math.max(0, viewportWidth - margin * 2));
	const availableHeight = Math.max(0, viewportHeight - margin * 2);
	const top = Math.max(
		margin,
		Math.min(
			panel.top,
			viewportHeight - margin - Math.min(240, availableHeight),
		),
	);
	const height = Math.min(640, Math.max(0, viewportHeight - top - margin));
	const right = panel.right + gap;
	const left =
		right + width <= viewportWidth - margin
			? right
			: panel.left - gap - width;
	return {
		left: Math.max(margin, Math.min(left, viewportWidth - width - margin)),
		top,
		width,
		height,
	};
}
