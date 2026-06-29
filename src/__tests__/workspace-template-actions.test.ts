import { describe, expect, it, vi } from 'vitest';
import { openCreatedTemplateNote } from '../ui/workspace/template-actions';

interface VaultEntry {
	kind: 'file' | 'folder';
	path: string;
}

interface VaultFile extends VaultEntry {
	kind: 'file';
}

describe('workspace template actions', () => {
	it('does not open when no file path was created', async () => {
		const { opener, getFile, openFile } = createOpener(undefined);

		await openCreatedTemplateNote(undefined, true, opener);

		expect(getFile).not.toHaveBeenCalled();
		expect(openFile).not.toHaveBeenCalled();
	});

	it('does not open when the setting is disabled', async () => {
		const { opener, getFile, openFile } = createOpener(createFile('Created.md'));

		await openCreatedTemplateNote('Created.md', false, opener);

		expect(getFile).not.toHaveBeenCalled();
		expect(openFile).not.toHaveBeenCalled();
	});

	it('opens created files', async () => {
		const file = createFile('Created.md');
		const { opener, getFile, openFile } = createOpener(file);

		await openCreatedTemplateNote('Created.md', true, opener);

		expect(getFile).toHaveBeenCalledWith('Created.md');
		expect(openFile).toHaveBeenCalledWith(file);
	});

	it('ignores non-openable vault entries', async () => {
		const { opener, openFile } = createOpener({
			kind: 'folder',
			path: 'Folder',
		});

		await openCreatedTemplateNote('Folder', true, opener);

		expect(openFile).not.toHaveBeenCalled();
	});
});

function createFile(path: string): VaultFile {
	return { kind: 'file', path };
}

function createOpener(file: VaultEntry | null | undefined): {
	opener: {
		getFile: (path: string) => VaultEntry | null | undefined;
		isOpenableFile: (entry: VaultEntry) => entry is VaultFile;
		openFile: (entry: VaultFile) => Promise<void>;
	};
	getFile: ReturnType<typeof vi.fn>;
	openFile: ReturnType<typeof vi.fn>;
} {
	const getFile = vi.fn(() => file ?? null);
	const openFile = vi.fn();
	return {
		opener: {
			getFile,
			isOpenableFile: (entry): entry is VaultFile => entry.kind === 'file',
			openFile: async (entry) => {
				openFile(entry);
			},
		},
		getFile,
		openFile,
	};
}
