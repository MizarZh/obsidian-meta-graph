import type { App } from 'obsidian';
import type { ExportFormat } from './export-options';

export function pngFilename(value: string): string {
	return exportFilename(value, 'png');
}

export function exportFilename(value: string, extension: ExportFormat): string {
	const stem = value
		.trim()
		.replace(/\.(?:png|svg|json|csv|md)$/iu, '')
		// Control characters are invalid in portable vault filenames.
		// eslint-disable-next-line no-control-regex
		.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-')
		.replace(/^[. ]+|[. ]+$/gu, '')
		.slice(0, 120);
	return `${stem || 'Graph'}.${extension}`;
}

export async function savePng(
	app: App,
	name: string,
	blob: Blob,
	isStale: () => boolean,
): Promise<string> {
	return saveExport(app, name, 'png', blob, isStale);
}

export async function saveExport(
	app: App,
	name: string,
	extension: ExportFormat,
	blob: Blob,
	isStale: () => boolean,
): Promise<string> {
	const bytes = await blob.arrayBuffer();
	const filename = exportFilename(name, extension);
	const stem = filename.slice(0, -(extension.length + 1));
	for (let suffix = 0; suffix < 1000; suffix++) {
		if (isStale()) throw new Error('Export cancelled');
		const path = suffix ? `${stem} (${suffix}).${extension}` : filename;
		if (app.vault.getAbstractFileByPath(path)) continue;
		try {
			await app.vault.createBinary(path, bytes);
			return path;
		} catch (error) {
			// Another save may have claimed this name after the read.
			if (!app.vault.getAbstractFileByPath(path)) throw error;
		}
	}
	throw new Error('Unable to find an unused filename');
}
