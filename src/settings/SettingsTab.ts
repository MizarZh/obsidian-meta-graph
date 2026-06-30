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

		new Setting(this.containerEl)
			.setName('Show debug button')
			.setDesc('Show a toolbar button that opens the graph debug panel.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDebugButton)
					.onChange(async (value) => {
						this.plugin.settings.showDebugButton = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(this.containerEl)
			.setName('Relayout flow after connecting nodes')
			.setDesc(
				'Run the flow layout after creating a metadata link. Off keeps existing node positions until you refresh manually.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.relayoutFlowAfterConnection)
					.onChange(async (value) => {
						this.plugin.settings.relayoutFlowAfterConnection =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(this.containerEl)
			.setName('Open template notes in new tab')
			.setDesc(
				'Automatically open notes created from templates in a new tab.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openTemplateNoteInNewTab)
					.onChange(async (value) => {
						this.plugin.settings.openTemplateNoteInNewTab = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
