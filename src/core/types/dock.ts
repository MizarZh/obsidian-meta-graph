import type { NodeId } from './graph';

export type DockConnectionDirection =
	'from-graph-to-dock' | 'from-dock-to-graph';

export interface DockTemplateNode {
	id: string;
	label: string;
	templatePath: string;
	targetFolder: string;
	relationField: string;
	direction: DockConnectionDirection;
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
