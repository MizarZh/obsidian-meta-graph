import { App, Modal, Setting } from 'obsidian';

export class ConfirmDeleteViewModal extends Modal {
	constructor(
		app: App,
		private readonly viewName: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Delete view');
		this.contentEl.createEl('p', {
			text: `Delete "${this.viewName}"? This cannot be undone.`,
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button.setButtonText('Delete').onClick(() => {
					this.onConfirm();
					this.close();
				}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
