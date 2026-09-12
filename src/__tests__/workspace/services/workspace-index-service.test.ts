import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

let WorkspaceIndexService: typeof import('@/workspace/services/workspace-index-service').WorkspaceIndexService;

beforeAll(async () => {
	({ WorkspaceIndexService } =
		await import('@/workspace/services/workspace-index-service'));
});

describe('workspace index service', () => {
	it('detects empty notes and updates their status when body content changes', async () => {
		const files = [
			'Zero.md',
			'Whitespace.md',
			'Properties.md',
			'Body.md',
			'Unknown.md',
		].map(createFile);
		files[0]!.stat.size = 0;
		const caches = new Map<string, Record<string, unknown> | null>([
			['Zero.md', null],
			['Whitespace.md', {}],
			['Properties.md', { sections: [{ type: 'yaml' }] }],
			[
				'Body.md',
				{ sections: [{ type: 'yaml' }, { type: 'paragraph' }] },
			],
			['Unknown.md', null],
		]);
		const { app } = createApp(
			files,
			(file) => caches.get(file.path) ?? null,
		);
		const service = new WorkspaceIndexService(app);
		const initial = await service.read(false, []);
		for (const path of ['Zero.md', 'Whitespace.md', 'Properties.md']) {
			expect(initial.index.nodes.get(path)?.isEmpty).toBe(true);
		}
		expect(initial.index.nodes.get('Body.md')?.isEmpty).toBe(false);
		expect(initial.index.nodes.get('Unknown.md')?.isEmpty).toBeUndefined();
		caches.set('Properties.md', {
			sections: [{ type: 'yaml' }, { type: 'heading' }],
		});
		service.invalidateFile(files[2]!);
		expect(
			(await service.read(false, [])).index.nodes.get('Properties.md')
				?.isEmpty,
		).toBe(false);
		caches.set('Properties.md', { sections: [{ type: 'yaml' }] });
		service.invalidateFile(files[2]!);
		expect(
			(await service.read(false, [])).index.nodes.get('Properties.md')
				?.isEmpty,
		).toBe(true);
	});

	it.each([false, true])(
		'finalizes a batch once and matches sequential updates (debug=%s)',
		async (debug) => {
			const files = ['A.md', 'B.md', 'C.md', 'Stable.md'].map(createFile);
			const caches = new Map(
				files.map((file) => [
					file.path,
					{
						frontmatter: {
							tags: ['shared', 'old'],
							domain: ['common', 'old-domain'],
							'leads-to': ['[[Old missing]]'],
						},
					},
				]),
			);
			const { app } = createApp(
				files,
				(file) => caches.get(file.path) ?? null,
			);
			const batch = new WorkspaceIndexService(app);
			const sequential = new WorkspaceIndexService(app);
			batch.setLargeVaultMode('on');
			sequential.setLargeVaultMode('on');
			const snapshot = await batch.read(debug, ['leads-to']);
			await sequential.read(debug, ['leads-to']);
			const stableSource = snapshot.metadataSources.find(
				(source) => source.path === 'Stable.md',
			)!;
			const stableLink = snapshot.unresolvedLinks.find(
				(link) => link.sourcePath === 'Stable.md',
			)!;
			const readSourcePath = vi.fn(() => 'Stable.md');
			const readLinkPath = vi.fn(() => 'Stable.md');
			Object.defineProperty(stableSource, 'path', {
				get: readSourcePath,
			});
			Object.defineProperty(stableLink, 'sourcePath', {
				get: readLinkPath,
			});
			let tags = snapshot.availableTags;
			let domains = snapshot.availableDomains;
			const publishTags = vi.fn((value: string[]) => {
				tags = value;
			});
			const publishDomains = vi.fn((value: string[]) => {
				domains = value;
			});
			Object.defineProperty(snapshot, 'availableTags', {
				get: () => tags,
				set: publishTags,
			});
			Object.defineProperty(snapshot, 'availableDomains', {
				get: () => domains,
				set: publishDomains,
			});
			for (const file of files.slice(0, 3)) {
				caches.set(file.path, {
					frontmatter: {
						tags: ['shared', file.path],
						domain: ['common', file.path],
						'leads-to':
							file.path === 'A.md' ? [] : ['[[New missing]]'],
					},
				});
				batch.invalidateFile(file);
				sequential.invalidateFile(file);
				await sequential.read(debug, ['leads-to']);
			}
			await batch.read(debug, ['leads-to']);
			expect(readSourcePath).toHaveBeenCalledTimes(1);
			expect(readLinkPath).toHaveBeenCalledTimes(1);
			expect(publishTags).toHaveBeenCalledTimes(1);
			expect(publishDomains).toHaveBeenCalledTimes(1);
			expect(snapshot).toEqual(
				await sequential.read(debug, ['leads-to']),
			);
			expect(snapshot.availableTags).toContain('old');
			expect(snapshot.availableDomains).toContain('old-domain');
			const stable = files[3]!;
			caches.set(stable.path, {
				frontmatter: { tags: [], domain: [], 'leads-to': [] },
			});
			batch.invalidateFile(stable);
			await batch.read(debug, ['leads-to']);
			expect(snapshot.availableTags).not.toContain('old');
			expect(snapshot.availableTags).toContain('shared');
			expect(snapshot.availableDomains).not.toContain('old-domain');
			expect(snapshot.index.nodes.has('__unresolved__/Old missing')).toBe(
				false,
			);
		},
	);

	it('shares a failed full build, then retries without invalidation', async () => {
		const { app, getMarkdownFiles } = createApp();
		const service = new WorkspaceIndexService(app);
		getMarkdownFiles.mockImplementationOnce(() => {
			throw new Error('Metadata unavailable');
		});
		const failed = await Promise.allSettled([
			service.read(false, []),
			service.read(false, []),
		]);
		expect(failed.map((result) => result.status)).toEqual([
			'rejected',
			'rejected',
		]);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
		const recovered = await service.read(false, []);
		expect(await service.read(false, [])).toBe(recovered);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(2);
		expect(service.getPerformanceSnapshot().fullBuildCount).toBe(1);
	});

	it('keeps a failed incremental batch dirty without publishing partial changes', async () => {
		const files = [createFile('First.md'), createFile('Second.md')];
		let tag = 'before';
		let fail = false;
		const readCache = vi.fn((file: TFile) => {
			if (fail && file.path === 'Second.md')
				throw new Error('Metadata unavailable');
			return { frontmatter: { tags: [tag] } };
		});
		const { app, getMarkdownFiles } = createApp(files, readCache);
		const service = new WorkspaceIndexService(app);
		service.setLargeVaultMode('on');
		const original = await service.read(false, []);
		tag = 'after';
		fail = true;
		files.forEach((file) => service.invalidateFile(file));
		await expect(service.read(false, [])).rejects.toThrow(
			'Metadata unavailable',
		);
		expect(original.index.nodes.get('First.md')?.tags).toEqual(['before']);
		expect(original.availableTags).toEqual(['before']);
		expect(service.getPerformanceSnapshot().incrementalBuildCount).toBe(0);
		fail = false;
		readCache.mockClear();
		const recovered = await service.read(false, []);
		expect(recovered).toBe(original);
		expect(recovered.availableTags).toEqual(['after']);
		for (const file of files)
			expect(recovered.index.nodes.get(file.path)?.tags).toEqual([
				'after',
			]);
		expect(readCache).toHaveBeenCalledTimes(2);
		await service.read(false, []);
		expect(readCache).toHaveBeenCalledTimes(2);
		expect(getMarkdownFiles).toHaveBeenCalledTimes(1);
	});

	it('does not lose a newer invalidation for the same file while indexing', async () => {
		const file = createFile('Changed.md');
		let tag = 'before';
		let invalidateDuringRead = false;
		const { app } = createApp([file], () => {
			const cache = { frontmatter: { tags: [tag] } };
			if (invalidateDuringRead) {
				invalidateDuringRead = false;
				tag = 'latest';
				service.invalidateFile(file);
			}
			return cache;
		});
		const service = new WorkspaceIndexService(app);
		service.setLargeVaultMode('on');
		await service.read(false, []);
		tag = 'intermediate';
		invalidateDuringRead = true;
		service.invalidateFile(file);
		await service.read(false, []);
		const latest = await service.read(false, []);
		expect(latest.index.nodes.get(file.path)?.tags).toEqual(['latest']);
	});

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
