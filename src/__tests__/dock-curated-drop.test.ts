import { describe, expect, it } from 'vitest';
import { DockCuratedDropController } from '../ui/workspace/dock-curated-drop';
import type { DockDragPayload } from '../ui/dock/types';

describe('DockCuratedDropController', () => {
	it('drops a dock note onto a graph group', () => {
		const harness = createHarness();
		const payload: DockDragPayload = {
			kind: 'note',
			notePath: 'Notes/A.md',
			label: 'A',
			direction: 'from-dock-to-graph',
			relationField: 'related',
		};

		expect(
			harness.controller.handlePointerDown(payload, pointerEvent(10, 10)),
		).toBe(true);
		harness.dispatch('pointermove', pointerEvent(120, 160));
		harness.dispatch('pointerup', pointerEvent(120, 160));

		expect(harness.rendererGroups).toEqual(['group-a', undefined]);
		expect(harness.activeNodeGroups).toEqual(['group-a', undefined]);
		expect(harness.positionGroups).toEqual(['group-a', 'group-a']);
		expect(harness.actions).toEqual([
			{
				kind: 'add-note',
				notePath: 'Notes/A.md',
				position: { x: 20, y: 60 },
				groupId: 'group-a',
			},
		]);
		expect(harness.previews).toEqual([
			{ x: 20, y: 60, label: 'A', groupId: 'group-a' },
			undefined,
		]);
	});

	it('does not drop on click without a drag gesture', () => {
		const harness = createHarness();
		const payload: DockDragPayload = {
			kind: 'template',
			templateId: 'template-1',
			label: 'Template',
		};

		harness.controller.handlePointerDown(payload, pointerEvent(10, 10));
		harness.dispatch('pointermove', pointerEvent(12, 12));
		harness.dispatch('pointerup', pointerEvent(120, 160));

		expect(harness.actions).toEqual([]);
		expect(harness.rendererGroups).toEqual([]);
		expect(harness.previews).toEqual([undefined]);
	});

	it('ignores drops outside the graph canvas', () => {
		const harness = createHarness();
		const payload: DockDragPayload = {
			kind: 'template',
			templateId: 'template-1',
			label: 'Template',
		};

		harness.controller.handlePointerDown(payload, pointerEvent(10, 10));
		harness.dispatch('pointermove', pointerEvent(420, 160));
		harness.dispatch('pointerup', pointerEvent(420, 160));

		expect(harness.actions).toEqual([]);
		expect(harness.rendererGroups).toEqual([]);
	});

	it('does not start outside curated charts', () => {
		const harness = createHarness('query');
		const payload: DockDragPayload = {
			kind: 'note',
			notePath: 'Notes/A.md',
			label: 'A',
			direction: 'from-dock-to-graph',
			relationField: 'related',
		};

		expect(
			harness.controller.handlePointerDown(payload, pointerEvent(10, 10)),
		).toBe(false);
		expect(harness.listenerCount()).toBe(0);
	});

	it('does not start when the payload is already in the graph', () => {
		const harness = createHarness('curated', {
			canStartDrag: false,
		});
		const payload: DockDragPayload = {
			kind: 'note',
			notePath: 'Notes/A.md',
			label: 'A',
			direction: 'from-dock-to-graph',
			relationField: 'related',
		};

		expect(
			harness.controller.handlePointerDown(payload, pointerEvent(10, 10)),
		).toBe(false);
		expect(harness.listenerCount()).toBe(0);
	});

	it('cancels when dropped back over a panel', () => {
		const harness = createHarness('curated', {
			readElementAtPoint: () => cancelTargetElement(),
		});
		const payload: DockDragPayload = {
			kind: 'note',
			notePath: 'Notes/A.md',
			label: 'A',
			direction: 'from-dock-to-graph',
			relationField: 'related',
		};

		harness.controller.handlePointerDown(payload, pointerEvent(10, 10));
		harness.dispatch('pointermove', pointerEvent(120, 160));
		harness.dispatch('pointerup', pointerEvent(120, 160));

		expect(harness.actions).toEqual([]);
		expect(harness.previews).toEqual([undefined, undefined]);
	});

	it('drops with a renderer that does not expose groups', () => {
		const harness = createHarness('curated', {
			renderer: {
				viewportToGraphPosition: ({
					x,
					y,
				}: {
					x: number;
					y: number;
				}) => ({
					x: x + 1,
					y: y + 2,
				}),
			},
		});
		const payload: DockDragPayload = {
			kind: 'template',
			templateId: 'template-1',
			label: 'Template',
		};

		expect(
			harness.controller.handlePointerDown(payload, pointerEvent(10, 10)),
		).toBe(true);
		harness.dispatch('pointermove', pointerEvent(120, 160));
		harness.dispatch('pointerup', pointerEvent(120, 160));

		expect(harness.actions).toEqual([
			{
				kind: 'create-template-note',
				templateId: 'template-1',
				label: 'Template',
				position: { x: 21, y: 62 },
				groupId: undefined,
			},
		]);
		expect(harness.activeNodeGroups).toEqual([]);
		expect(harness.rendererGroups).toEqual([]);
	});
});

function createHarness(
	chartSource: 'curated' | 'query' = 'curated',
	options: {
		canStartDrag?: boolean;
		readElementAtPoint?: () => Element | null;
		renderer?: unknown;
	} = {},
) {
	const listeners = new Map<string, (event: PointerEvent) => void>();
	const rendererGroups: Array<string | undefined> = [];
	const activeNodeGroups: Array<string | undefined> = [];
	const positionGroups: Array<string | undefined> = [];
	const previews: unknown[] = [];
	const actions: unknown[] = [];
	const canvas = {
		getBoundingClientRect: () => ({
			left: 100,
			top: 100,
			right: 300,
			bottom: 300,
			width: 200,
			height: 200,
		}),
	} as HTMLElement;
	const renderer = options.renderer ?? {
		getGroupAtViewportPosition: ({ x, y }: { x: number; y: number }) =>
			x >= 0 && y >= 0 ? 'group-a' : undefined,
		viewportToGraphPosition: (
			{ x, y }: { x: number; y: number },
			groupId?: string,
		) => {
			positionGroups.push(groupId);
			return { x, y };
		},
		setActiveDropGroup: (groupId?: string) => {
			rendererGroups.push(groupId);
		},
	};
	const controller = new DockCuratedDropController({
		window: {
			addEventListener: (
				type: string,
				listener: EventListenerOrEventListenerObject,
			) => {
				listeners.set(type, listener as (event: PointerEvent) => void);
			},
			removeEventListener: (type: string) => {
				listeners.delete(type);
			},
		} as unknown as Window,
		readCanvas: () => canvas,
		readRenderer: () => renderer as never,
		readChartSource: () => chartSource,
		readElementAtPoint: () => options.readElementAtPoint?.() ?? null,
		canStartDrag: () => options.canStartDrag ?? true,
		setDockDrag: () => undefined,
		setPreview: (preview) => {
			previews.push(preview);
		},
		setActiveNodeDropGroupId: (groupId) => {
			activeNodeGroups.push(groupId);
		},
		onDrop: (action) => {
			actions.push(action);
		},
	});
	return {
		controller,
		rendererGroups,
		activeNodeGroups,
		positionGroups,
		previews,
		actions,
		dispatch(type: string, event: PointerEvent) {
			listeners.get(type)?.(event);
		},
		listenerCount: () => listeners.size,
	};
}

function cancelTargetElement(): Element {
	return {
		closest: (selector: string) =>
			selector.includes('knowledge-workspace-dock-panel') ? {} : null,
	} as Element;
}

function pointerEvent(clientX: number, clientY: number): PointerEvent {
	return {
		button: 0,
		clientX,
		clientY,
		ctrlKey: false,
		metaKey: false,
	} as PointerEvent;
}
