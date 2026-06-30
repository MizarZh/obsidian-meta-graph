import { TFile, type App } from 'obsidian';
import { WorkspaceConnectionService } from './connection-service';

export function createObsidianConnectionService(
	app: App,
): WorkspaceConnectionService<TFile> {
	return new WorkspaceConnectionService<TFile>({
		getFile: (path) => app.vault.getAbstractFileByPath(path),
		isFile: (value): value is TFile => value instanceof TFile,
		getPath: (file) => file.path,
		generateMarkdownLink: (targetFile, sourcePath) =>
			app.fileManager.generateMarkdownLink(targetFile, sourcePath),
		processFrontMatter: (file, callback) =>
			app.fileManager.processFrontMatter(file, callback),
		resolveLink: (linkText, sourcePath) =>
			app.metadataCache.getFirstLinkpathDest(linkText, sourcePath),
	});
}
