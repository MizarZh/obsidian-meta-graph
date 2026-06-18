import { App, PluginSettingTab, Setting } from 'obsidian';
import type KnowledgeWorkspacePlugin from '../main';

export class KnowledgeWorkspaceSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: KnowledgeWorkspacePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName('Maximum nodes')
			.setDesc('Limit the number of notes shown in a local graph.')
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.maxNodes))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isFinite(parsed)) {
							this.plugin.settings.maxNodes = Math.min(
								300,
								Math.max(1, parsed),
							);
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(this.containerEl)
			.setName('Debug unresolved links')
			.setDesc('Log unresolved metadata links to the developer console.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
