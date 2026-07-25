import { App, PluginSettingTab, Setting } from 'obsidian';
import type KnowledgeWorkspacePlugin from '../main';
import type { NodeOpenMode } from '../core/types';
import type { LargeVaultMode } from './settings';

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
			.setName('Large vault mode')
			.setDesc(
				'Use incremental indexing and cooperative rendering for large vaults. Auto enables it at 5,000 Markdown files.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('auto', 'Auto')
					.addOption('on', 'On')
					.addOption('off', 'Off')
					.setValue(this.plugin.settings.largeVaultMode)
					.onChange(async (value) => {
						this.plugin.settings.largeVaultMode =
							value as LargeVaultMode;
						await this.plugin.saveSettings();
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
			.setName('Open notes in')
			.setDesc('Choose where notes open.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('tab', 'New tab')
					.addOption('right-split', 'Right split')
					.setValue(this.plugin.settings.nodeOpenMode)
					.onChange(async (value) => {
						this.plugin.settings.nodeOpenMode =
							value as NodeOpenMode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(this.containerEl)
			.setName('After creating a note')
			.setDesc(
				'Choose whether to stay on the graph or open the new note.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('stay', 'Stay on graph')
					.addOption('open', 'Open note')
					.setValue(
						this.plugin.settings.openTemplateNoteInNewTab
							? 'open'
							: 'stay',
					)
					.onChange(async (value) => {
						this.plugin.settings.openTemplateNoteInNewTab =
							value === 'open';
						await this.plugin.saveSettings();
					}),
			);
	}
}
