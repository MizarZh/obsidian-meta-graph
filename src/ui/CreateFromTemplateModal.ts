import { App, Modal, Setting } from 'obsidian';

export class CreateFromTemplateModal extends Modal {
	private name = '';
	private errorEl?: HTMLElement;

	constructor(
		app: App,
		private readonly templateLabel: string,
		private readonly targetTitle: string,
		private readonly onSubmit: (name: string) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Create note');
		this.contentEl.createEl('p', {
			text: `Create a ${this.templateLabel} note linked to ${this.targetTitle}.`,
		});
		new Setting(this.contentEl).setName('Name').addText((text) =>
			text.setPlaceholder('New note name').onChange((value) => {
				this.name = value;
				this.setError('');
			}),
		);
		this.errorEl = this.contentEl.createEl('div', {
			cls: 'knowledge-workspace-modal-error',
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText('Create')
					.onClick(() => {
						void this.submit();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const normalized = this.name.trim();
		if (!normalized) {
			this.setError('Enter a name.');
			return;
		}
		try {
			await this.onSubmit(normalized);
			this.close();
		} catch (error) {
			this.setError(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private setError(message: string): void {
		if (!this.errorEl) {
			return;
		}
		this.errorEl.setText(message);
		this.errorEl.toggleClass('visible', Boolean(message));
	}
}
