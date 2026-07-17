import type { NodeId } from './graph';

export type DockConnectionDirection =
	'from-graph-to-dock' | 'from-dock-to-graph';

export interface DockTemplateNode {
	id: string;
	label: string;
	templatePath: string;
	targetFolder: string;
	/** Active-chart projection of MetaGraphChart.templateOverrides. */
	defaultGroupId?: string;
}

export interface DockNoteNode {
	id: string;
	path: NodeId;
}

export interface MetaGraphDock {
	templates: DockTemplateNode[];
	notes: DockNoteNode[];
	dockWidth: number;
	curatedPanelWidth: number;
	focusOnSelect: boolean;
}
