import type { App } from 'obsidian';
import type {
	ChartGroup,
	DockTemplateNode,
	KnowledgeNode,
} from '../../core/types';
import type { DockDragPayload } from '../dock/types';

export type ReorderPlacement = 'before' | 'after';

interface SuggestionOption {
	value: string;
	label: string;
	detail?: string;
	searchText?: string;
}

export interface DockNoteEntry {
	id: string;
	path: string;
	title: string;
	broken: boolean;
	color?: string;
}

export interface DockTemplateEntry extends DockTemplateNode {
	templateMissing: boolean;
	broken: boolean;
}

export function countTitles<T extends { title: string }>(
	items: T[],
): Record<string, number> {
	return items.reduce<Record<string, number>>((acc, entry) => {
		acc[entry.title] = (acc[entry.title] ?? 0) + 1;
		return acc;
	}, {});
}

export function buildTemplateEntries(
	app: App,
	templates: DockTemplateNode[],
): DockTemplateEntry[] {
	return templates.map((template) => {
		const templateMissing =
			template.templatePath !== '' &&
			!app.vault.getAbstractFileByPath(template.templatePath);
		return {
			...template,
			templateMissing,
			broken:
				templateMissing ||
				(template.targetFolder !== '' &&
					!app.vault.getAbstractFileByPath(template.targetFolder)),
		};
	});
}

export function buildNoteOptions(
	availableNotes: KnowledgeNode[],
	titleCounts: Record<string, number>,
): SuggestionOption[] {
	return availableNotes.map((node) => ({
		value: node.path,
		label:
			(titleCounts[node.title] ?? 0) > 1
				? `${node.folder}/${node.title}`
				: node.title,
		detail: node.path,
		searchText: [node.title, node.path, ...(node.aliases ?? [])].join(' '),
	}));
}

export function buildTargetFolderOptions(app: App): SuggestionOption[] {
	const folderPaths = app.vault
		.getAllFolders()
		.map((folder) => (folder.path === '/' ? '' : folder.path))
		.filter(Boolean)
		.sort((left, right) =>
			left.localeCompare(right, undefined, { sensitivity: 'base' }),
		);
	return [
		{ value: '', label: 'Vault root', searchText: 'vault root' },
		...folderPaths.map((path) => ({
			value: path,
			label: path,
			searchText: path,
		})),
	];
}

export function buildGroupOptions(groups: ChartGroup[]) {
	return [
		{ value: '', label: 'No group' },
		...groups
			.filter((group) => group.mode === 'manual')
			.map((group) => ({
				value: group.id,
				label: group.name,
			})),
	];
}

export function templateDragPayload(
	template: DockTemplateNode,
): DockDragPayload {
	return {
		kind: 'template',
		templateId: template.id,
		label: template.label,
	};
}

export function noteDragPayload(
	entry: DockNoteEntry,
	activeConnectionField: string,
): DockDragPayload {
	return entry.broken
		? {
				kind: 'broken-note',
				notePath: entry.path,
				label: entry.title,
			}
		: {
				kind: 'note',
				notePath: entry.path,
				label: entry.title,
				direction: 'from-dock-to-graph',
				relationField: activeConnectionField,
			};
}

export function dragKey(payload: DockDragPayload): string {
	if (payload.kind === 'template') {
		return `template:${payload.templateId}`;
	}
	return `note:${payload.notePath}`;
}

export function readPointerPlacement(
	targetEl: HTMLElement,
	clientY: number,
): ReorderPlacement {
	const rect = targetEl.getBoundingClientRect();
	return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}
