import { describe, expect, it, vi } from 'vitest';
import { TFile, type WorkspaceLeaf } from 'obsidian';
import { KnowledgeWorkspaceView } from '@/workspace/KnowledgeWorkspaceView';
import type KnowledgeWorkspacePlugin from '@/main';
import type {
	PersistedMetaGraphDocumentV2,
	WorkspacePersistenceContext,
} from '@/workspace/meta-graph-v2/types';

const host = vi.hoisted(() => ({
	save: vi.fn<() => Promise<void>>(),
	unload: vi.fn<() => Promise<void>>(),
}));
vi.mock('obsidian', () => ({
	TFile: class {},
	TextFileView: class {
		file = null;
		data = '';
		save = host.save;
		onUnloadFile(): Promise<void> {
			return host.unload();
		}
	},
}));
vi.mock('@/workspace/meta-graph-document', () => ({
	stringifyMetaGraphDocument: () => 'saved workspace',
}));

function createView() {
	host.save.mockReset().mockResolvedValue(undefined);
	host.unload.mockReset().mockResolvedValue(undefined);
	return new KnowledgeWorkspaceView(
		{} as WorkspaceLeaf,
		{} as KnowledgeWorkspacePlugin,
	);
}

// Exercise the save callback supplied to Workspace, including host failures.
function persist(view: KnowledgeWorkspaceView, file: TFile) {
	return (
		view as unknown as {
			persistDocument(
				document: PersistedMetaGraphDocumentV2,
				context: WorkspacePersistenceContext,
				file: TFile,
			): Promise<void>;
		}
	).persistDocument(
		{} as PersistedMetaGraphDocumentV2,
		{ readOnly: false } as WorkspacePersistenceContext,
		file,
	);
}

describe('workspace view saving', () => {
	it('propagates actual host save failures', async () => {
		const view = createView();
		const file = new TFile();
		view.file = file;
		host.save.mockRejectedValueOnce(new Error('Disk unavailable'));
		await expect(persist(view, file)).rejects.toThrow('Disk unavailable');
		await persist(view, file);
		expect(host.save).toHaveBeenCalledTimes(2);
		expect(view.getViewData()).toBe('saved workspace');
	});

	it('does not write an old workspace into a newly opened file', async () => {
		const view = createView();
		const oldFile = new TFile();
		view.file = new TFile();
		await expect(persist(view, oldFile)).rejects.toThrow(
			'workspace file changed',
		);
		expect(host.save).not.toHaveBeenCalled();
		expect(view.getViewData()).toBe('');
	});

	it('waits for pending workspace saves before unloading its file', async () => {
		const view = createView();
		let complete!: () => void;
		const pending = new Promise<void>((resolve) => {
			complete = resolve;
		});
		Object.assign(view, { component: { flushAutoSave: () => pending } });
		const unload = view.onUnloadFile(new TFile());
		expect(host.unload).not.toHaveBeenCalled();
		complete();
		await unload;
		expect(host.unload).toHaveBeenCalledOnce();
	});

	it('does not continue unloading after a failed flush', async () => {
		const view = createView();
		Object.assign(view, {
			component: {
				flushAutoSave: () =>
					Promise.reject(new Error('Disk unavailable')),
			},
		});
		await expect(view.onUnloadFile(new TFile())).rejects.toThrow(
			'Disk unavailable',
		);
		expect(host.unload).not.toHaveBeenCalled();
	});
});
