import type { App } from 'obsidian';
import { normalizePath } from './knowledge-index';

export interface LinkResolver {
	resolve(linkText: string, sourcePath: string): string | undefined;
}

export class ObsidianLinkResolver implements LinkResolver {
	constructor(private readonly app: App) {}

	resolve(linkText: string, sourcePath: string): string | undefined {
		const target = this.app.metadataCache.getFirstLinkpathDest(
			linkText,
			sourcePath,
		);
		return target ? normalizePath(target.path) : undefined;
	}
}

export function extractLinkText(value: string): string {
	const trimmed = value.trim();
	const wikiLink = trimmed.match(/^\[\[([^\]]+)\]\]$/u);
	const content = wikiLink?.[1] ?? trimmed;
	return (content.split('|')[0] ?? '').split('#')[0]?.trim() ?? '';
}
