export interface ThemeDocumentLike {
	documentElement: { className: string };
	body: { className: string };
}

export function readThemeSignature(document: ThemeDocumentLike): string {
	return `${document.documentElement.className}|${document.body.className}`;
}

export function readInteractiveAccentColor(
	document: Document,
	fallback = '#7c6ff0',
): string {
	return (
		document.defaultView
			?.getComputedStyle(document.body)
			.getPropertyValue('--interactive-accent')
			.trim() || fallback
	);
}
