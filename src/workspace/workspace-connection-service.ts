import { normalizePath } from '../core/knowledge-index';
import { extractLinkText } from '../core/link-resolver';
import type {
	ConnectionFieldMode,
	DockConnectionDirection,
	NodeId,
} from '../core/types';

export interface WorkspaceConnectionAdapter<FileEntry> {
	getFile(path: string): unknown;
	isFile(value: unknown): value is FileEntry;
	getPath(file: FileEntry): string;
	generateMarkdownLink(targetFile: FileEntry, sourcePath: string): string;
	processFrontMatter(
		file: FileEntry,
		callback: (frontmatter: Record<string, unknown>) => void,
	): Promise<void>;
	resolveLink(linkText: string, sourcePath: string): FileEntry | null | undefined;
}

export interface ConnectionUndoChange {
	sourcePath: string;
	field: string;
	link: string;
	hadField: boolean;
	previousValue: unknown;
}

type ConnectionUndoEntry = ConnectionUndoChange[];

export class WorkspaceConnectionService<FileEntry> {
	private readonly undoStack: ConnectionUndoEntry[] = [];

	constructor(private readonly adapter: WorkspaceConnectionAdapter<FileEntry>) {}

	get undoCount(): number {
		return this.undoStack.length;
	}

	async connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection,
		field: string,
		mode: ConnectionFieldMode,
	): Promise<boolean> {
		const [sourceNodeId, targetPath] =
			direction === 'from-dock-to-graph'
				? [notePath, targetNodeId]
				: [targetNodeId, notePath];
		return this.connectNodes(sourceNodeId, targetPath, field, mode);
	}

	async connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field: string,
		mode: ConnectionFieldMode,
	): Promise<boolean> {
		const normalizedField = field.trim();
		if (!normalizedField || sourceNodeId === targetNodeId) {
			return false;
		}
		const sourceFile = this.adapter.getFile(sourceNodeId);
		const targetFile = this.adapter.getFile(targetNodeId);
		if (!this.adapter.isFile(sourceFile) || !this.adapter.isFile(targetFile)) {
			return false;
		}

		if (mode === 'reverse') {
			const reverseLink = this.adapter.generateMarkdownLink(
				sourceFile,
				this.adapter.getPath(targetFile),
			);
			return this.recordUndo(
				await this.addFrontmatterConnection(
					targetFile,
					sourceFile,
					normalizedField,
					reverseLink,
				),
			);
		}

		const link = this.adapter.generateMarkdownLink(
			targetFile,
			this.adapter.getPath(sourceFile),
		);
		const undo = await this.addFrontmatterConnection(
			sourceFile,
			targetFile,
			normalizedField,
			link,
		);
		if (mode === 'bidirectional') {
			const reverseLink = this.adapter.generateMarkdownLink(
				sourceFile,
				this.adapter.getPath(targetFile),
			);
			undo.push(
				...(await this.addFrontmatterConnection(
					targetFile,
					sourceFile,
					normalizedField,
					reverseLink,
				)),
			);
		}
		return this.recordUndo(undo);
	}

	async undoLastConnection(): Promise<boolean> {
		while (this.undoStack.length > 0) {
			const undo = this.undoStack.pop();
			if (!undo) {
				break;
			}
			if (await this.undoFrontmatterChanges(undo)) {
				return true;
			}
		}
		return false;
	}

	private recordUndo(undo: ConnectionUndoEntry): boolean {
		if (undo.length === 0) {
			return false;
		}
		this.undoStack.push(undo);
		return true;
	}

	private frontmatterValueLinksToTarget(
		value: unknown,
		sourcePath: string,
		targetPath: string,
	): boolean {
		if (typeof value !== 'string') {
			return false;
		}
		const linkText = extractLinkText(value);
		const resolved = this.adapter.resolveLink(linkText, sourcePath);
		return (
			normalizePath(resolved ? this.adapter.getPath(resolved) : linkText) ===
			normalizePath(targetPath)
		);
	}

	private async addFrontmatterConnection(
		sourceFile: FileEntry,
		targetFile: FileEntry,
		field: string,
		link: string,
	): Promise<ConnectionUndoChange[]> {
		let undo: ConnectionUndoChange | undefined;
		await this.adapter.processFrontMatter(sourceFile, (frontmatter) => {
			const data = asFrontmatterRecord(frontmatter);
			const hadField = Object.prototype.hasOwnProperty.call(data, field);
			const currentValue = data[field];
			const currentValues = toFrontmatterArray(currentValue);
			if (
				currentValues.some((value) =>
					this.frontmatterValueLinksToTarget(
						value,
						this.adapter.getPath(sourceFile),
						this.adapter.getPath(targetFile),
					),
				)
			) {
				return;
			}
			undo = {
				sourcePath: this.adapter.getPath(sourceFile),
				field,
				link,
				hadField,
				previousValue: cloneFrontmatterValue(currentValue),
			};
			data[field] = [...currentValues, link];
		});
		return undo ? [undo] : [];
	}

	private async undoFrontmatterChanges(
		changes: ConnectionUndoEntry,
	): Promise<boolean> {
		let changed = false;
		for (const undo of [...changes].reverse()) {
			const sourceFile = this.adapter.getFile(undo.sourcePath);
			if (!this.adapter.isFile(sourceFile)) {
				continue;
			}

			await this.adapter.processFrontMatter(sourceFile, (frontmatter) => {
				const data = asFrontmatterRecord(frontmatter);
				const currentValue = data[undo.field];
				const currentValues = toFrontmatterArray(currentValue);
				const remainingValues = currentValues.filter(
					(value) => !frontmatterValueEquals(value, undo.link),
				);
				if (remainingValues.length === currentValues.length) {
					return;
				}

				const previousValues = toFrontmatterArray(undo.previousValue);
				if (undo.hadField && valuesEqual(remainingValues, previousValues)) {
					data[undo.field] = undo.previousValue;
				} else if (!undo.hadField && remainingValues.length === 0) {
					delete data[undo.field];
				} else {
					data[undo.field] = remainingValues;
				}
				changed = true;
			});
		}
		return changed;
	}
}

function asFrontmatterRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function toFrontmatterArray(value: unknown): unknown[] {
	if (Array.isArray(value)) {
		return value;
	}
	return value === undefined || value === null ? [] : [value];
}

function cloneFrontmatterValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => cloneFrontmatterValue(item));
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				cloneFrontmatterValue(item),
			]),
		);
	}
	return value;
}

function frontmatterValueEquals(value: unknown, expected: string): boolean {
	return typeof value === 'string' && value.trim() === expected.trim();
}

function valuesEqual(left: unknown[], right: unknown[]): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
