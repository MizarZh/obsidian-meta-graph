import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import {
	createWorkspaceContextMenu,
	type WorkspaceContextMenuContext,
} from '@/ui/workspace/context-menu';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

const captured = vi.hoisted(() => ({
	items: [] as { title: string; disabled: boolean; click: () => unknown }[],
}));
vi.mock('obsidian', () => ({
	Notice: vi.fn(),
	TFile: class {},
	Menu: class {
		addSeparator() {
			return this;
		}
		showAtMouseEvent() {}
		addItem(build: (item: unknown) => void) {
			const item = {
				title: '',
				disabled: false,
				click: () => {},
				setTitle(value: string) {
					this.title = value;
					return this;
				},
				setIcon() {
					return this;
				},
				setChecked() {
					return this;
				},
				setIsLabel() {
					return this;
				},
				setDisabled(value: boolean) {
					this.disabled = value;
					return this;
				},
				onClick(value: () => void) {
					this.click = value;
					return this;
				},
			};
			build(item);
			captured.items.push(item);
			return this;
		}
	},
}));
function setup() {
	const context = {
		app: {} as App,
		state: createWorkspaceState(200),
		readOnly: false,
		trace: undefined,
		controller: {
			setNodeGroup: vi.fn(),
			setCuratedFilesHidden: vi.fn(),
			refresh: vi.fn().mockResolvedValue(undefined),
			selectNode: vi.fn(),
			addGroup: vi.fn(),
		},
		viewport: {
			togglePinnedHover: vi.fn(),
			clearPinnedHover: vi.fn(),
			fit: vi.fn(),
			setZoomLevel: vi.fn(),
		},
		openNote: vi.fn().mockResolvedValue(undefined),
		openInSplit: vi.fn().mockResolvedValue(undefined),
		showDetails: vi.fn(),
		recalculateLayout: vi.fn().mockResolvedValue(undefined),
		openSettingsPanel: vi.fn(),
		setTrace: vi.fn(),
	} satisfies WorkspaceContextMenuContext;
	return { context, show: createWorkspaceContextMenu(context) };
}
const item = (title: string) =>
	captured.items.find((item) => item.title === title)!;
beforeEach(() => {
	captured.items = [];
});
describe('workspace context menus', () => {
	it('separates data refresh from explicit layout recalculation', () => {
		const { context, show } = setup();
		show({ kind: 'stage' }, {} as MouseEvent);
		item('Refresh nodes').click();
		expect(context.controller.refresh).toHaveBeenCalledWith(false);
		expect(context.recalculateLayout).not.toHaveBeenCalled();
		context.controller.refresh.mockClear();
		item('Recalculate layout').click();
		expect(context.recalculateLayout).toHaveBeenCalledOnce();
		expect(context.controller.refresh).not.toHaveBeenCalled();
	});
	it('routes stage navigation and preserves clear-selection behavior', () => {
		const { context, show } = setup();
		show({ kind: 'stage' }, {} as MouseEvent);
		item('Reset zoom').click();
		expect(context.viewport.setZoomLevel).toHaveBeenCalledWith(100);
		item('Clear selection and focus').click();
		expect(context.viewport.clearPinnedHover).toHaveBeenCalledOnce();
		expect(context.controller.selectNode).toHaveBeenCalledWith(undefined);
	});
	it('disables curated writes in read-only views while retaining trace and opening', () => {
		const { context } = setup();
		const readOnlyContext = {
			...context,
			readOnly: true,
			state: { ...context.state, chartSource: 'curated' as const },
		};
		createWorkspaceContextMenu(readOnlyContext)(
			{ kind: 'node', nodeId: 'A.md' },
			{} as MouseEvent,
		);
		expect(item('Hide note').disabled).toBe(true);
		item('Trace upstream').click();
		expect(context.setTrace).toHaveBeenCalledWith({
			mode: 'upstream',
			source: 'A.md',
		});
		item('Open in split').click();
		expect(context.openInSplit).toHaveBeenCalledWith('A.md');
	});
	it('uses replacement projection for logical edge actions', () => {
		const { context } = setup();
		let state = context.state;
		const show = createWorkspaceContextMenu({
			...context,
			get state() {
				return state;
			},
		});
		state = {
			...state,
			projection: {
				nodes: [],
				rootIds: new Set(),
				edges: [
					{
						id: 'logical',
						source: 'A.md',
						target: 'B.md',
						relation: 'related',
						directed: true,
						sourcePath: 'A.md',
						sourceField: 'related',
					},
				],
			},
		};
		show({ kind: 'edge', edgeId: 'logical' }, {} as MouseEvent);
		item('Open target: B.md').click();
		expect(context.openNote).toHaveBeenCalledWith('B.md');
		item('Focus source: A.md').click();
		expect(context.viewport.togglePinnedHover).toHaveBeenCalledWith('A.md');
	});
});
