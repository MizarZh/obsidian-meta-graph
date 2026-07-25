import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

let WorkspaceIndexService: typeof import('../workspace/services/workspace-index-service').WorkspaceIndexService;

beforeAll(async () => {
	({ WorkspaceIndexService } =
		await import('../workspace/services/workspace-index-service'));
});

describe('workspace index service', () => {
	it('reuses cached snapshots until invalidated', async () => {
		const { app, getMarkdownFiles } = createApp();
		const service = new WorkspaceIndexService(app);

		const first = await service.read(false, ['leads-to']);
		const second = await service.read(false, ['leads-to']);

		expect(second).toBe(first);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(1);

		service.invalidate();
		const third = await service.read(false, ['leads-to']);

		expect(third).not.toBe(first);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(2);
	});

	it('keeps separate snapshots for connection field sets', async () => {
		const { app, getMarkdownFiles } = createApp();
		const service = new WorkspaceIndexService(app);

		const first = await service.read(false, ['leads-to']);
		const second = await service.read(false, ['supports']);
		const third = await service.read(false, ['supports']);

		expect(second).not.toBe(first);
		expect(third).toBe(second);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(2);
	});

	it('reindexes only a changed file in Large Vault mode', async () => {
		const file = createFile('Notes/Changed.md');
		let cache: Record<string, unknown> | null = {
			frontmatter: { tags: ['before'] },
		};
		const { app, getMarkdownFiles } = createApp([file], () => cache);
		const service = new WorkspaceIndexService(app);
		service.setLargeVaultMode('on');

		const first = await service.read(false, ['leads-to']);
		const firstIndex = first.index;
		expect(first.index.nodes.get(file.path)?.tags).toEqual(['before']);
		cache = { frontmatter: { tags: ['after'] } };
		service.invalidateFile(file);
		const second = await service.read(false, ['leads-to']);

		expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
		expect(second.index).toBe(firstIndex);
		expect(second.index.nodes.get(file.path)?.tags).toEqual(['after']);
		expect(service.getPerformanceSnapshot()).toMatchObject({
			fullBuildCount: 1,
			incrementalBuildCount: 1,
			lastBuildKind: 'incremental',
			lastChangedFileCount: 1,
			largeVaultModeActive: true,
		});
	});

	it('keeps full rebuilds in Auto mode below the large vault threshold', async () => {
		const file = createFile('Notes/Changed.md');
		const { app, getMarkdownFiles } = createApp([file], () => null);
		const service = new WorkspaceIndexService(app);

		const first = await service.read(false, []);
		service.invalidateFile(file);
		const second = await service.read(false, []);

		expect(second.index).not.toBe(first.index);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(2);
		expect(service.getPerformanceSnapshot()).toMatchObject({
			fullBuildCount: 2,
			incrementalBuildCount: 0,
			largeVaultModeActive: false,
		});
	});

	it('retains shared unresolved nodes until their final owner is removed', async () => {
		const firstFile = createFile('Notes/First.md');
		const secondFile = createFile('Notes/Second.md');
		const caches = new Map<string, Record<string, unknown> | null>([
			[firstFile.path, { links: [{ link: 'Missing' }] }],
			[secondFile.path, { links: [{ link: 'Missing' }] }],
		]);
		const { app } = createApp(
			[firstFile, secondFile],
			(file) => caches.get(file.path) ?? null,
		);
		const service = new WorkspaceIndexService(app);
		service.setLargeVaultMode('on');

		const first = await service.read(false, []);
		const unresolvedNodeId = '__unresolved__/Missing';
		expect(first.index.nodes.has(unresolvedNodeId)).toBe(true);
		expect(first.index.edges.size).toBe(2);

		caches.set(firstFile.path, null);
		service.invalidateFile(firstFile);
		const second = await service.read(false, []);
		expect(second.index.nodes.has(unresolvedNodeId)).toBe(true);
		expect(second.index.edges.size).toBe(1);

		caches.set(secondFile.path, null);
		service.invalidateFile(secondFile);
		const third = await service.read(false, []);
		expect(third.index.nodes.has(unresolvedNodeId)).toBe(false);
		expect(third.index.edges.size).toBe(0);
	});

	it('waits for layout readiness before indexing', async () => {
		const { app, getMarkdownFiles } = createApp();
		(
			app as unknown as {
				workspace: { layoutReady: boolean };
			}
		).workspace = { layoutReady: false };
		const service = new WorkspaceIndexService(app);
		let resolved = false;
		const read = service.read(false, []).then(() => {
			resolved = true;
		});

		await Promise.resolve();
		expect(resolved).toBe(false);
		expect(getMarkdownFiles).not.toHaveBeenCalled();

		service.markReady();
		await read;
		expect(getMarkdownFiles).toHaveBeenCalledOnce();
	});
});

function createApp(): {
	app: ConstructorParameters<typeof WorkspaceIndexService>[0];
	getMarkdownFiles: ReturnType<typeof vi.fn>;
};
function createApp(
	files: TFile[],
	readCache: (file: TFile) => Record<string, unknown> | null,
): {
	app: ConstructorParameters<typeof WorkspaceIndexService>[0];
	getMarkdownFiles: ReturnType<typeof vi.fn>;
};
function createApp(
	files: TFile[] = [],
	readCache: (file: TFile) => Record<string, unknown> | null = () => null,
): {
	app: ConstructorParameters<typeof WorkspaceIndexService>[0];
	getMarkdownFiles: ReturnType<typeof vi.fn>;
} {
	const getMarkdownFiles = vi.fn(() => files);
	const app = {
		workspace: { layoutReady: true },
		vault: {
			getMarkdownFiles,
			getAllLoadedFiles: vi.fn(() => []),
		},
		metadataCache: {
			getFileCache: vi.fn((file: TFile) => readCache(file)),
			getFirstLinkpathDest: vi.fn(() => null),
		},
	} as unknown as ConstructorParameters<typeof WorkspaceIndexService>[0];
	return { app, getMarkdownFiles };
}

function createFile(path: string): TFile {
	const name = path.split('/').at(-1) ?? path;
	// A real TFile requires an initialized Vault; this fixture only uses metadata fields.
	return {
		path,
		name,
		basename: name.replace(/\.md$/u, ''),
		extension: 'md',
		stat: { size: 10, ctime: 1, mtime: 2 },
		parent: {
			path: path.includes('/')
				? path.slice(0, path.lastIndexOf('/'))
				: '/',
		},
		// eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
	} as unknown as TFile;
}
