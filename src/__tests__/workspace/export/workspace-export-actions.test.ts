import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { ExportModal } from '@/ui/ExportModal';
import {
	createWorkspaceExport,
	type WorkspaceExportContext,
} from '@/ui/workspace/export-actions';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import type { ChartExportOptions } from '@/workspace/export/export-options';
import { createPngExport } from '@/workspace/export/png-export';
import { saveExport } from '@/workspace/export/export-file';
import { Notice } from 'obsidian';

let modal: ConstructorParameters<typeof ExportModal>[1] | undefined;
vi.mock('obsidian', () => ({ Notice: vi.fn() }));
vi.mock('@/ui/ExportModal', () => ({
	ExportModal: class {
		constructor(
			_app: App,
			options: ConstructorParameters<typeof ExportModal>[1],
		) {
			modal = options;
		}
		open() {}
	},
}));
vi.mock('@/workspace/export/png-export', () => ({ createPngExport: vi.fn() }));
vi.mock('@/workspace/export/export-file', () => ({
	saveExport: vi.fn().mockResolvedValue('saved'),
}));
const options: ChartExportOptions = {
	format: 'json',
	range: 'graph',
	scale: 1,
	background: 'theme',
	legend: false,
	filename: 'Graph',
	entryScope: 'chart',
	entries: 'both',
	includeMetadata: false,
};
function setup() {
	const context: WorkspaceExportContext = {
		app: {} as App,
		state: {
			...createWorkspaceState(200),
			projection: { nodes: [], edges: [], rootIds: new Set() },
		},
		canvas: {
			isConnected: true,
			getBoundingClientRect: () => ({ width: 800, height: 600 }),
		} as HTMLElement,
		loading: false,
		metadataFields: [],
		metadataTypes: {},
		lifecycle: { renderer: undefined, generation: 1 },
		getLayoutSnapshot: vi.fn(),
	};
	return context;
}
beforeEach(() => {
	modal = undefined;
	vi.clearAllMocks();
});
describe('workspace export actions', () => {
	it('allows entry-only export without renderer and uses current state at submission', async () => {
		const context = setup();
		let state = context.state;
		createWorkspaceExport({
			...context,
			get state() {
				return state;
			},
		})();
		expect(modal?.imageAvailable).toBe(false);
		state = {
			...state,
			projection: {
				nodes: [
					{
						id: 'A.md',
						path: 'A.md',
						title: 'New note',
						folder: '',
						tags: [],
						domains: [],
					},
				],
				edges: [],
				rootIds: new Set(),
			},
		};
		await modal!.onExport(options, () => false);
		const blob = vi.mocked(saveExport).mock.calls[0]![3];
		expect(await blob.text()).toContain('New note');
	});
	it('rejects chart changes, disconnection and user cancellation before saving', async () => {
		const context = setup();
		let state = context.state;
		createWorkspaceExport({
			...context,
			get state() {
				return state;
			},
		})();
		state = { ...state, activeChartId: 'other' };
		await expect(modal!.onExport(options, () => false)).rejects.toThrow(
			'Export cancelled',
		);
		state = context.state;
		await expect(modal!.onExport(options, () => true)).rejects.toThrow(
			'Export cancelled',
		);
		Object.defineProperty(context.canvas, 'isConnected', { value: false });
		await expect(modal!.onExport(options, () => false)).rejects.toThrow(
			'Export cancelled',
		);
		expect(saveExport).not.toHaveBeenCalled();
	});
	it('blocks opening and submitting while the graph is updating', async () => {
		const context = setup();
		let loading = true;
		const open = createWorkspaceExport({
			...context,
			get loading() {
				return loading;
			},
		});
		open();
		expect(Notice).toHaveBeenCalledWith('Graph is not ready');
		expect(modal).toBeUndefined();
		loading = false;
		open();
		loading = true;
		await expect(modal!.onExport(options, () => false)).rejects.toThrow(
			'Graph is updating',
		);
	});
	it('cancels an asynchronous image export when renderer generation changes', async () => {
		const context = setup();
		const renderer = {} as NonNullable<
			WorkspaceExportContext['lifecycle']['renderer']
		>;
		let generation = 1;
		const lifecycle = {
			renderer,
			get generation() {
				return generation;
			},
		};
		createWorkspaceExport({ ...context, lifecycle })();
		vi.mocked(createPngExport).mockImplementationOnce(async (input) => {
			generation++;
			expect(input.isStale()).toBe(true);
			return new Blob();
		});
		vi.mocked(saveExport).mockImplementationOnce(
			async (_app, _filename, _format, _blob, isStale) => {
				if (isStale()) throw new Error('Export cancelled');
				return 'saved';
			},
		);
		await expect(
			modal!.onExport({ ...options, format: 'png' }, () => false),
		).rejects.toThrow('Export cancelled');
	});
});
