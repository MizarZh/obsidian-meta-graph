import { beforeAll, describe, expect, it, vi } from 'vitest';

let WorkspaceIndexService: typeof import('../workspace/services/workspace-index-service').WorkspaceIndexService;

beforeAll(async () => {
	({ WorkspaceIndexService } = await import(
		'../workspace/services/workspace-index-service'
	));
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
});

function createApp(): {
	app: ConstructorParameters<typeof WorkspaceIndexService>[0];
	getMarkdownFiles: ReturnType<typeof vi.fn>;
} {
	const getMarkdownFiles = vi.fn(() => []);
	const app = {
		vault: {
			getMarkdownFiles,
			getAllLoadedFiles: vi.fn(() => []),
		},
		metadataCache: {
			getFileCache: vi.fn(() => null),
			getFirstLinkpathDest: vi.fn(() => null),
		},
	} as unknown as ConstructorParameters<typeof WorkspaceIndexService>[0];
	return { app, getMarkdownFiles };
}
