import { Menu, Notice, TFile, type App } from 'obsidian';
import type {
	WorkspaceState,
	GraphTraceRequest,
	SettingsPanelMode,
} from '@/core/types';
import type { GraphContextMenuTarget } from '@/graph/renderers/renderer-events';
import type { WorkspaceController } from '@/workspace/workspace-controller';
import {
	getGroupMoveTargets,
	canMoveNodeToGroup,
} from '@/query/group-ownership';
import { resolveGroupCapabilities } from '@/workspace/groups/group-policy';
import {
	createWorkspaceGroupByNode,
	type WorkspaceRendererLifecycle,
} from '@/ui/workspace/renderer-lifecycle';
import {
	currentNodeStyleTarget,
	currentLinkStyleTarget,
} from '@/ui/workspace/current-style-target';

export interface WorkspaceContextMenuContext {
	readonly app: App;
	readonly state: WorkspaceState;
	readonly readOnly: boolean;
	readonly trace: GraphTraceRequest | undefined;
	readonly controller: Pick<
		WorkspaceController,
		| 'setNodeGroup'
		| 'setCuratedFilesHidden'
		| 'refresh'
		| 'selectNode'
		| 'addGroup'
	>;
	viewport: Pick<
		WorkspaceRendererLifecycle,
		'togglePinnedHover' | 'clearPinnedHover' | 'fit' | 'setZoomLevel'
	>;
	openNote(nodeId: string): Promise<void>;
	openInSplit(nodeId: string): Promise<void>;
	showDetails(): void;
	recalculateLayout(): Promise<void>;
	openSettingsPanel(
		panel: SettingsPanelMode,
		event?: MouseEvent,
		groupId?: string,
		styleKey?: string,
	): void;
	setTrace(request: GraphTraceRequest): void;
}

/** Read live context when actions execute, including after chart/state replacement. */
export function createWorkspaceContextMenu(
	context: WorkspaceContextMenuContext,
) {
	async function openNoteInNewTab(nodeId: string): Promise<void> {
		const file = context.app.vault.getAbstractFileByPath(nodeId);
		if (file instanceof TFile) {
			await context.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	function showGraphContextMenu(
		target: GraphContextMenuTarget,
		event: MouseEvent,
	): void {
		const menu = new Menu();
		if (target.kind === 'node') {
			addNodeContextMenuItems(menu, target.nodeId);
		} else if (target.kind === 'edge') {
			addEdgeContextMenuItems(menu, target.edgeId);
		} else if (target.kind === 'group') {
			addGroupContextMenuItems(menu, target.groupId);
		} else {
			addStageContextMenuItems(menu);
		}
		menu.showAtMouseEvent(event);
	}

	function addNodeContextMenuItems(menu: Menu, nodeId: string): void {
		for (const entry of [
			{
				mode: 'upstream',
				title: 'Trace upstream',
				icon: 'arrow-up-left',
			},
			{
				mode: 'downstream',
				title: 'Trace downstream',
				icon: 'arrow-down-right',
			},
			{
				mode: 'path',
				title: 'Find shortest path from here',
				icon: 'route',
			},
		] as const) {
			menu.addItem((item) =>
				item
					.setTitle(entry.title)
					.setIcon(entry.icon)
					.onClick(() =>
						context.setTrace({ mode: entry.mode, source: nodeId }),
					),
			);
		}
		if (context.trace?.mode === 'path' && context.trace.source !== nodeId) {
			const source = context.trace.source;
			menu.addItem((item) =>
				item
					.setTitle('Find path to here')
					.setIcon('flag')
					.onClick(() =>
						context.setTrace({
							...context.trace,
							mode: 'path',
							source,
							target: nodeId,
						}),
					),
			);
		}
		menu.addSeparator();
		const node = context.state.projection?.nodes.find(
			(item) => item.id === nodeId,
		);
		menu.addItem((item) =>
			item
				.setTitle('Open in split')
				.setIcon('panel-right')
				.onClick(() => void context.openInSplit(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(() => void openNoteInNewTab(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Focus relationships')
				.setIcon('pin')
				.onClick(() => context.viewport.togglePinnedHover(nodeId)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(() => context.showDetails()),
		);

		const capabilities = resolveGroupCapabilities(context.state.mode);
		const groups = capabilities.canAssignManually
			? getGroupMoveTargets(
					context.state.projection?.nodes.find(
						(node) => node.id === nodeId,
					),
					context.state.grouping.groups,
				)
			: [];
		if (groups.length > 0) {
			menu.addSeparator();
			const currentGroupId = createWorkspaceGroupByNode(
				context.state,
			).get(nodeId);
			for (const group of groups) {
				menu.addItem((item) =>
					item
						.setTitle(`Move to group: ${group.name}`)
						.setIcon('folder-input')
						.setChecked(currentGroupId === group.id)
						.setDisabled(
							context.readOnly || currentGroupId === group.id,
						)
						.onClick(() =>
							context.controller.setNodeGroup(nodeId, group.id),
						),
				);
			}
			if (
				context.state.mode !== 'cube' &&
				currentGroupId &&
				canMoveNodeToGroup(
					context.state.projection?.nodes.find(
						(node) => node.id === nodeId,
					),
					context.state.grouping.groups,
					null,
				)
			) {
				menu.addItem((item) =>
					item
						.setTitle('Remove from group')
						.setIcon('folder-minus')
						.setDisabled(context.readOnly)
						.onClick(() =>
							context.controller.setNodeGroup(nodeId, null),
						),
				);
			}
		}

		menu.addSeparator();
		if (context.state.chartSource === 'curated') {
			menu.addItem((item) =>
				item
					.setTitle('Hide note')
					.setIcon('eye-off')
					.setDisabled(context.readOnly)
					.onClick(() =>
						context.controller.setCuratedFilesHidden(
							[nodeId],
							true,
						),
					),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle('Copy wiki link')
				.setIcon('copy')
				.onClick(
					() =>
						void copyContextText(
							`[[${nodeId.replace(/\.md$/i, '')}]]`,
						),
				),
		);
		if (node) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Edit node style settings')
					.setIcon('palette')
					.setDisabled(context.readOnly)
					.onClick(() =>
						context.openSettingsPanel(
							'note-style',
							undefined,
							undefined,
							currentNodeStyleTarget(context.state, node),
						),
					),
			);
		}
	}

	function addEdgeContextMenuItems(menu: Menu, edgeId: string): void {
		const edge = context.state.projection?.edges.find(
			(item) => item.id === edgeId,
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(() => context.showDetails()),
		);
		if (!edge) return;
		const sourceTitle = getContextNodeTitle(edge.source);
		const targetTitle = getContextNodeTitle(edge.target);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(`Open source: ${sourceTitle}`)
				.setIcon('file-input')
				.onClick(() => void context.openNote(edge.source)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Open target: ${targetTitle}`)
				.setIcon('file-output')
				.onClick(() => void context.openNote(edge.target)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Focus source: ${sourceTitle}`)
				.setIcon('pin')
				.onClick(() => context.viewport.togglePinnedHover(edge.source)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Focus target: ${targetTitle}`)
				.setIcon('pin')
				.onClick(() => context.viewport.togglePinnedHover(edge.target)),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Copy relationship')
				.setIcon('copy')
				.onClick(
					() =>
						void copyContextText(
							`${sourceTitle} ${edge.directed ? `—[${edge.relation}]→` : `—[${edge.relation}]—`} ${targetTitle}`,
						),
				),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Edit link style settings')
				.setIcon('palette')
				.setDisabled(context.readOnly)
				.onClick(() =>
					context.openSettingsPanel(
						'link-style',
						undefined,
						undefined,
						currentLinkStyleTarget(context.state, edge),
					),
				),
		);
	}

	function addGroupContextMenuItems(menu: Menu, groupId: string): void {
		const group = context.state.grouping.groups.find(
			(item) => item.id === groupId,
		);
		menu.addItem((item) =>
			item
				.setTitle(group?.name ?? 'Group')
				.setIcon('group')
				.setIsLabel(true),
		);
		menu.addItem((item) =>
			item
				.setTitle('Show details')
				.setIcon('panel-right')
				.onClick(() => context.showDetails()),
		);
		const capabilities = resolveGroupCapabilities(
			context.state.mode,
			group,
		);
		if (
			group &&
			(capabilities.canEditIdentity || capabilities.canEditAppearance)
		) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle('Edit group')
					.setIcon('settings-2')
					.setDisabled(context.readOnly)
					.onClick(() =>
						context.openSettingsPanel('groups', undefined, groupId),
					),
			);
		}
	}

	function addStageContextMenuItems(menu: Menu): void {
		menu.addItem((item) =>
			item
				.setTitle('Fit graph')
				.setIcon('maximize')
				.onClick(() => context.viewport.fit()),
		);
		menu.addItem((item) =>
			item
				.setTitle('Reset zoom')
				.setIcon('scan')
				.onClick(() => context.viewport.setZoomLevel(100)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Refresh nodes')
				.setIcon('refresh-cw')
				.onClick(() => void context.controller.refresh(false)),
		);
		menu.addItem((item) =>
			item
				.setTitle('Recalculate layout')
				.setIcon('layout-dashboard')
				.onClick(() => void context.recalculateLayout()),
		);
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle('Clear selection and focus')
				.setIcon('circle-off')
				.onClick(() => {
					context.viewport.clearPinnedHover();
					context.controller.selectNode(undefined);
				}),
		);
		if (resolveGroupCapabilities(context.state.mode).canCreate) {
			menu.addItem((item) =>
				item
					.setTitle('Add group')
					.setIcon('folder-plus')
					.setDisabled(context.readOnly)
					.onClick(() => context.controller.addGroup()),
			);
		}
	}

	function getContextNodeTitle(nodeId: string): string {
		return (
			context.state.projection?.nodes.find((node) => node.id === nodeId)
				?.title ?? nodeId
		);
	}

	async function copyContextText(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			new Notice('Copied to clipboard');
		} catch {
			new Notice('Unable to copy to clipboard');
		}
	}

	return showGraphContextMenu;
}
