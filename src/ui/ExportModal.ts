import { Modal, type App } from 'obsidian';
import { mount, unmount } from 'svelte';
import ExportDialog from '@/ui/ExportDialog.svelte';
import type { ChartExportOptions } from '@/workspace/export/export-options';

export class ExportModal extends Modal {
	private component?: ReturnType<typeof mount>;
	private cancelled = false;
	constructor(
		app: App,
		private readonly options: {
			name: string;
			planar: boolean;
			width: number;
			height: number;
			showLegend: boolean;
			imageAvailable: boolean;
			hasSelection: boolean;
			nodeCount: number;
			edgeCount: number;
			onExport: (
				options: ChartExportOptions,
				isCancelled: () => boolean,
			) => Promise<string>;
		},
	) {
		super(app);
	}
	onOpen(): void {
		this.setTitle('Export chart');
		this.component = mount(ExportDialog, {
			target: this.contentEl,
			props: {
				...this.options,
				onExport: (options: ChartExportOptions) =>
					this.options.onExport(options, () => this.cancelled),
				onCancel: () => this.close(),
			},
		});
	}
	onClose(): void {
		this.cancelled = true;
		if (this.component) void unmount(this.component);
		this.component = undefined;
	}
}
