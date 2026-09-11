/** Remember hidden sizes too: a renderer may repaint at 1×1 while its file
 * tab is hidden, even when the tab later returns to the same visible size. */
export function createCanvasResizeHandler(resize: () => void) {
	let previousWidth = 0;
	let previousHeight = 0;
	return (size?: { width: number; height: number }): void => {
		if (!size) return;
		const { width, height } = size;
		const changed = width !== previousWidth || height !== previousHeight;
		previousWidth = width;
		previousHeight = height;
		if (width > 0 && height > 0 && changed) resize();
	};
}
