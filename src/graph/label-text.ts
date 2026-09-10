/** Zero means unlimited. Truncate only for display; keep full model names. */
export function normalizeLabelMaxWidth(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.floor(value))
		: 0;
}

export function truncateLabel(
	text: string,
	maxWidth: number,
	measure: (text: string) => number,
): string {
	if (
		!Number.isFinite(maxWidth) ||
		maxWidth <= 0 ||
		measure(text) <= maxWidth
	)
		return text;
	const suffix = '...';
	if (measure(suffix) > maxWidth) return '';
	const characters = Array.from(text);
	let low = 0;
	let high = characters.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (measure(characters.slice(0, middle).join('') + suffix) <= maxWidth)
			low = middle;
		else high = middle - 1;
	}
	return characters.slice(0, low).join('') + suffix;
}
