export function normalizeTag(value: string): string {
	return value.trim().replace(/^#+/u, '');
}

export function normalizeTags(values: readonly string[]): string[] {
	const tags = new Set<string>();
	for (const value of values) {
		const tag = normalizeTag(value);
		if (tag) {
			tags.add(tag);
		}
	}
	return [...tags];
}
