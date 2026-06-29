export interface CreatedTemplateNoteOpener<FileEntry, OpenableFile extends FileEntry> {
	getFile: (path: string) => FileEntry | null | undefined;
	isOpenableFile: (file: FileEntry) => file is OpenableFile;
	openFile: (file: OpenableFile) => Promise<void>;
}

export async function openCreatedTemplateNote<FileEntry, OpenableFile extends FileEntry>(
	filePath: string | undefined,
	openInNewTab: boolean,
	opener: CreatedTemplateNoteOpener<FileEntry, OpenableFile>,
): Promise<void> {
	if (!filePath || !openInNewTab) {
		return;
	}
	const file = opener.getFile(filePath);
	if (file && opener.isOpenableFile(file)) {
		await opener.openFile(file);
	}
}
