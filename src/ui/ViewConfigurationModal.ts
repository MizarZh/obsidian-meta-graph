import { Modal, normalizePath, type App } from 'obsidian';
import { mount, unmount } from 'svelte';
import type { WorkspaceState } from '@/core/types';
import type {
	ConfigurationSelection,
	ViewConfiguration,
} from '@/workspace/configuration/view-configuration';
import ViewConfigurationDialog from '@/ui/ViewConfigurationDialog.svelte';

export class ViewConfigurationModal extends Modal {
	private component?: ReturnType<typeof mount>;
	constructor(
		app: App,
		private readonly state: WorkspaceState,
		private readonly apply: (
			config: ViewConfiguration,
			selection: ConfigurationSelection,
		) => void,
	) {
		super(app);
	}
	onOpen(): void {
		this.containerEl.classList.add(
			'knowledge-workspace-configuration-container',
		);
		this.modalEl.classList.add('knowledge-workspace-configuration-modal');
		this.setTitle('View configuration');
		this.component = mount(ViewConfigurationDialog, {
			target: this.contentEl,
			props: {
				workspaceState: this.state,
				onApply: this.apply,
				onClose: () => this.close(),
				onExport: async (
					config: ViewConfiguration,
					filename: string,
				) => {
					const basename =
						filename
							.replace(/\.json$/i, '')
							.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
							.trim()
							.replace(/^\.+|\.+$/g, '') || 'View configuration';
					let path = normalizePath(`${basename}.json`),
						suffix = 2;
					while (this.app.vault.getAbstractFileByPath(path))
						path = normalizePath(`${basename} (${suffix++}).json`);
					await this.app.vault.create(
						path,
						JSON.stringify(config, null, 2),
					);
					return path;
				},
			},
		});
	}
	onClose(): void {
		if (this.component) void unmount(this.component);
		this.component = undefined;
	}
}
