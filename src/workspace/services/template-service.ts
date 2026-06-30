import { TFile, TFolder, type App } from 'obsidian';
import { normalizePath } from '../../core/knowledge-index';
import type { DockTemplateNode } from '../../core/types';

export async function createTemplateNoteFile(
	app: App,
	template: DockTemplateNode,
	title: string,
): Promise<TFile> {
	const folderPath = normalizePath(template.targetFolder);
	await ensureFolderPath(app, folderPath);
	const filePath = createAvailableMarkdownPath(app, folderPath, title);
	const content = await renderTemplateContent(app, template, title);
	const file = await app.vault.create(filePath, content);
	await processTemplaterContent(app, template, file, content);
	return file;
}

async function renderTemplateContent(
	app: App,
	template: DockTemplateNode,
	title: string,
): Promise<string> {
	const templateFile = app.vault.getAbstractFileByPath(
		normalizePath(template.templatePath),
	);
	const raw =
		templateFile instanceof TFile
			? await app.vault.cachedRead(templateFile)
			: '# {{title}}\n';
	const rendered = raw
		.replaceAll('{{title}}', title)
		.replaceAll('{{name}}', title)
		.replaceAll('{{date}}', window.moment().format('YYYY-MM-DD'))
		.replaceAll('{{time}}', window.moment().format('HH:mm'))
		.replace(/\{\{date:(.+?)\}\}/gu, (_, fmt: string) =>
			window.moment().format(fmt),
		);
	return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

async function ensureFolderPath(app: App, folderPath: string): Promise<void> {
	const normalized = normalizePath(folderPath);
	if (!normalized) {
		return;
	}
	let current = '';
	for (const part of normalized.split('/').filter(Boolean)) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (existing instanceof TFolder) {
			continue;
		}
		if (existing) {
			throw new Error(`Cannot create folder "${current}". A file exists there.`);
		}
		await app.vault.createFolder(current);
	}
}

function createAvailableMarkdownPath(
	app: App,
	folderPath: string,
	title: string,
): string {
	const baseName = sanitizeFileName(title);
	const folder = normalizePath(folderPath);
	let index = 1;
	while (true) {
		const suffix = index === 1 ? '' : ` ${index}`;
		const path = normalizePath(
			folder
				? `${folder}/${baseName}${suffix}.md`
				: `${baseName}${suffix}.md`,
		);
		if (!app.vault.getAbstractFileByPath(path)) {
			return path;
		}
		index += 1;
	}
}

async function processTemplaterContent(
	app: App,
	template: DockTemplateNode,
	file: TFile,
	content: string,
): Promise<void> {
	const appRuntime = app as unknown as {
		plugins: {
			plugins: Record<
				string,
				{ templater?: Record<string, unknown> } | undefined
			>;
		};
	};
	const templaterPlugin = appRuntime.plugins.plugins['templater-obsidian'];
	if (!templaterPlugin?.templater) {
		return;
	}
	try {
		const templateFile = app.vault.getAbstractFileByPath(
			normalizePath(template.templatePath),
		);
		const templater = templaterPlugin.templater as unknown as {
			create_running_config(
				template_file: TFile | undefined,
				target_file: TFile,
				run_mode: number,
			): unknown;
			parse_template(config: unknown, content: string): Promise<string>;
		};
		const config = templater.create_running_config(
			templateFile instanceof TFile ? templateFile : undefined,
			file,
			2,
		);
		const processed = await templater.parse_template(config, content);
		await app.vault.modify(file, processed);
	} catch (error) {
		console.warn(
			'[Meta Graph] Templater processing failed, using fallback content.',
			error,
		);
	}
}

function sanitizeFileName(value: string): string {
	const sanitized = value
		.trim()
		.replace(/[\\/:*?"<>|#^[\]]/gu, '-')
		.replace(/\s+/gu, ' ')
		.replace(/^-+|-+$/gu, '');
	return sanitized || 'Untitled';
}
