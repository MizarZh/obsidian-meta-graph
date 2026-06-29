import { describe, expect, it, vi } from 'vitest';
import { openResolvedMetadataLink } from '../ui/workspace/metadata-link-actions';

interface FileEntry {
	path: string;
}

describe('workspace metadata link actions', () => {
	it('opens the resolved metadata target', async () => {
		const file = { path: 'Target.md' };
		const { opener, resolveLink, openFile } = createOpener(file);

		await openResolvedMetadataLink('[[Target|Alias]]', 'Source.md', opener);

		expect(resolveLink).toHaveBeenCalledWith('Target', 'Source.md');
		expect(openFile).toHaveBeenCalledWith(file);
	});

	it('does not open when no metadata target is resolved', async () => {
		const { opener, openFile } = createOpener(null);

		await openResolvedMetadataLink('[[Missing]]', 'Source.md', opener);

		expect(openFile).not.toHaveBeenCalled();
	});
});

function createOpener(file: FileEntry | null): {
	opener: {
		resolveLink: (linkText: string, sourcePath: string) => FileEntry | null;
		openFile: (entry: FileEntry) => Promise<void>;
	};
	resolveLink: ReturnType<typeof vi.fn>;
	openFile: ReturnType<typeof vi.fn>;
} {
	const resolveLink = vi.fn(() => file);
	const openFile = vi.fn();
	return {
		opener: {
			resolveLink,
			openFile: async (entry) => {
				openFile(entry);
			},
		},
		resolveLink,
		openFile,
	};
}
