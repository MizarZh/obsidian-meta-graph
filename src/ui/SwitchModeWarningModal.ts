import { App, Modal, Setting } from 'obsidian';
import type { WorkspaceSwitchWarning } from '../workspace/state/switch-warnings';

export class SwitchModeWarningModal extends Modal {
	constructor(
		app: App,
		private readonly warning: WorkspaceSwitchWarning,
		private readonly onConfirm: () => void,
		private readonly onDuplicate: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.warning.title);
		for (const detail of this.warning.details) {
			this.contentEl.createEl('p', { text: detail });
		}
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button.setButtonText('Duplicate view').onClick(() => {
					this.onDuplicate();
					this.close();
				}),
			)
			.addButton((button) =>
				button.setButtonText(this.warning.confirmLabel).onClick(() => {
					this.onConfirm();
					this.close();
				}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
