import { extractLinkText } from '../../core/link-resolver';

export interface MetadataLinkOpener<FileEntry> {
	resolveLink: (linkText: string, sourcePath: string) => FileEntry | null;
	openFile: (file: FileEntry) => Promise<void>;
}

export async function openResolvedMetadataLink<FileEntry>(
	linkText: string,
	sourcePath: string,
	opener: MetadataLinkOpener<FileEntry>,
): Promise<void> {
	const target = opener.resolveLink(extractLinkText(linkText), sourcePath);
	if (target) {
		await opener.openFile(target);
	}
}
