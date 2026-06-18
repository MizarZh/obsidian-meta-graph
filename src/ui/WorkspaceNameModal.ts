import { App, Modal, Notice, Setting } from 'obsidian';
import type { SavedWorkspace } from '../core/types';

export class WorkspaceNameModal extends Modal {
	constructor(
		app: App,
		private readonly initialName: string,
		private readonly onSubmit: (name: string) => Promise<SavedWorkspace>,
		private readonly onSaved: (workspace: SavedWorkspace) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Save workspace');
		let name = this.initialName;
		new Setting(this.contentEl)
			.setName('Name')
			.addText((text) => {
				text.setValue(name).onChange((value) => {
					name = value;
				});
				window.setTimeout(() => {
					text.inputEl.focus();
					text.inputEl.select();
				});
			});
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					const normalized = name.trim();
					if (!normalized) {
						new Notice('Enter a workspace name.');
						return;
					}
					button.setDisabled(true);
					try {
						const workspace = await this.onSubmit(normalized);
						this.onSaved(workspace);
						this.close();
					} catch {
						new Notice('Failed to save workspace.');
						button.setDisabled(false);
					}
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
