import { App, Modal, Setting } from 'obsidian';

export class ConfirmDeleteWorkspaceModal extends Modal {
	constructor(
		app: App,
		private readonly workspaceName: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Delete workspace');
		this.contentEl.createEl('p', {
			text: `Delete "${this.workspaceName}"? This cannot be undone.`,
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText('Cancel')
					.onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText('Delete')
					.onClick(() => {
						this.onConfirm();
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
