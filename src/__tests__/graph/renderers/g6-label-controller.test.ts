import { GraphEvent, type RuntimeContext } from '@antv/g6';
import { describe, expect, it, vi } from 'vitest';
import {
	G6LabelController,
	G6_LABEL_CONTROLLER_KEY,
	type G6LabelControllerSnapshot,
} from '@/graph/renderers/g6/g6-label-controller';

describe('G6 label controller', () => {
	it('applies physical width constraints to node and edge labels without changing text', () => {
		const label = { update: vi.fn(), setLocalScale: vi.fn() };
		const attributes = { labelText: '金融市场投资' };
		const controller = new G6LabelController(
			{
				graph: { on: vi.fn(), off: vi.fn() },
				element: {
					getElement: () => ({
						attributes,
						getShape: () => label,
						getLabelStyle: (style: Record<string, unknown>) => ({
							text: style.labelText,
							wordWrap: style.labelWordWrap,
							wordWrapWidth: style.labelMaxWidth,
						}),
					}),
				},
			} as unknown as RuntimeContext,
			{
				type: G6_LABEL_CONTROLLER_KEY,
				snapshot: {
					nodeIds: new Set(['node']),
					edgeIds: new Set(['edge']),
					nodeStyle: {},
					edgeStyle: {},
				},
			},
		);
		const snapshot = {
			nodeIds: new Set(['node']),
			edgeIds: new Set(['edge']),
			nodeStyle: {},
			edgeStyle: {},
		};
		const limited = { labelWordWrap: true, labelMaxWidth: 120 };
		controller.updateLabels({
			...snapshot,
			nodeStyle: limited,
			edgeStyle: limited,
		});
		expect(label.update).toHaveBeenLastCalledWith({
			text: '金融市场投资',
			wordWrap: true,
			wordWrapWidth: 120,
		});
		expect(label.update).toHaveBeenCalledTimes(2);
		controller.updateLabels(snapshot);
		expect(label.update).toHaveBeenLastCalledWith({
			text: '金融市场投资',
			wordWrap: undefined,
			wordWrapWidth: undefined,
		});
		expect(attributes.labelText).toBe('金融市场投资');
		controller.destroy();
	});
	it('retains translated node labels while updating edges, new labels, styles and zoom', () => {
		const nodeLabel = { update: vi.fn(), setLocalScale: vi.fn() };
		const edgeLabel = { update: vi.fn(), setLocalScale: vi.fn() };
		let currentNodeLabel = nodeLabel;
		const listeners = new Map<string, (event: never) => void>();
		const controller = new G6LabelController(
			{
				graph: {
					on: (event: string, listener: (event: never) => void) =>
						listeners.set(event, listener),
					off: vi.fn(),
				},
				element: {
					getElement: (id: string) => ({
						attributes: { labelText: id },
						getLabelStyle: () => ({ text: id, fontSize: 12 }),
						getShape: () =>
							id === 'node' ? currentNodeLabel : edgeLabel,
					}),
				},
			} as unknown as RuntimeContext,
			{
				type: G6_LABEL_CONTROLLER_KEY,
				snapshot: {
					nodeIds: new Set(['node']),
					edgeIds: new Set(['edge']),
					nodeStyle: {},
					edgeStyle: {},
				},
			},
		);
		const draw = (stage: string) =>
			listeners.get(GraphEvent.AFTER_DRAW)!({
				data: {
					stage,
					dataChanges: [
						{ value: { id: 'node' } },
						{ value: { id: 'edge' } },
					],
				},
			} as never);
		draw('translate'); // An uncached label must still be initialized.
		expect(nodeLabel.update).toHaveBeenCalledOnce();
		for (let i = 0; i < 60; i++) draw('translate');
		expect(nodeLabel.update).toHaveBeenCalledOnce();
		expect(edgeLabel.update).toHaveBeenCalledTimes(61);
		controller.updateZoomScale(0.5);
		expect(nodeLabel.setLocalScale).toHaveBeenLastCalledWith(0.5);
		draw('state');
		expect(nodeLabel.update).toHaveBeenCalledTimes(2);
		currentNodeLabel = { update: vi.fn(), setLocalScale: vi.fn() };
		draw('translate');
		expect(currentNodeLabel.update).toHaveBeenCalledOnce();
		expect(currentNodeLabel.setLocalScale).toHaveBeenCalledWith(0.5);
		controller.destroy();
	});
	it('merges partial hover membership without visiting untouched labels', () => {
		const getElement = vi.fn(() => ({
			attributes: {},
			getLabelStyle: () => ({ fontSize: 9 }),
			getShape: () => ({ update: vi.fn(), setLocalScale: vi.fn() }),
		}));
		const controller = new G6LabelController(
			{
				graph: { on: vi.fn(), off: vi.fn() },
				element: { getElement },
			} as unknown as RuntimeContext,
			{ type: G6_LABEL_CONTROLLER_KEY, snapshot: createSnapshot() },
		);
		controller.updateLabels(
			{
				...createSnapshot(),
				partial: true,
				nodeIds: new Set(['hover.md']),
				edgeIds: new Set(),
			},
			{ nodeIds: ['hover.md'], edgeIds: [] },
		);
		expect(getElement.mock.calls).toHaveLength(1);
		getElement.mockClear();
		controller.updateZoomScale(2);
		expect(getElement).toHaveBeenCalledWith('A.md');
		getElement.mockClear();
		controller.updateLabels(
			{
				...createSnapshot(),
				partial: true,
				nodeIds: new Set(),
				edgeIds: new Set(),
			},
			{ nodeIds: ['hover.md'], edgeIds: [] },
		);
		getElement.mockClear();
		controller.updateZoomScale(1);
		expect(getElement).not.toHaveBeenCalledWith('hover.md');
		controller.destroy();
	});
	it('updates only existing label subshapes and disables label picking', () => {
		const update = vi.fn();
		const setLocalScale = vi.fn();
		const getLabelStyle = vi.fn(() => ({
			fontSize: 9,
			fill: '#123456',
			pointerEvents: 'none',
		}));
		const getElement = vi.fn((id: string) =>
			id === 'A.md'
				? {
						attributes: { labelText: 'A' },
						getLabelStyle,
						getShape: () => ({ update, setLocalScale }),
					}
				: undefined,
		);
		const listeners = new Map<string, (event: never) => void>();
		const graph = {
			on: vi.fn((event: string, listener: (event: never) => void) => {
				listeners.set(event, listener);
			}),
			off: vi.fn(),
		};
		const context = {
			graph,
			element: { getElement },
		} as unknown as RuntimeContext;
		const snapshot = createSnapshot();
		const controller = new G6LabelController(context, {
			type: G6_LABEL_CONTROLLER_KEY,
			snapshot,
		});

		controller.updateLabels(snapshot);

		expect(getElement).toHaveBeenCalledWith('A.md');
		expect(getLabelStyle).toHaveBeenCalledWith({
			labelText: 'A',
			labelFontSize: 9,
		});
		expect(update).toHaveBeenCalledWith({
			fontSize: 9,
			fill: '#123456',
			pointerEvents: 'none',
		});
		expect(setLocalScale).toHaveBeenCalledWith(1);
		expect(getElement).toHaveBeenCalledWith('missing.md');

		getElement.mockClear();
		setLocalScale.mockClear();
		controller.updateZoomScale(0.5);
		expect(setLocalScale).toHaveBeenCalledOnce();
		expect(setLocalScale).toHaveBeenCalledWith(0.5);
		expect(getElement).toHaveBeenCalledOnce();
		expect(getElement).toHaveBeenCalledWith('missing.md');

		controller.destroy();
		expect(graph.off).toHaveBeenCalledWith(
			GraphEvent.AFTER_DRAW,
			expect.any(Function),
		);
	});

	it('reapplies current styles only to elements changed by a G6 draw', () => {
		const update = vi.fn();
		const setLocalScale = vi.fn();
		const getElement = vi.fn(() => ({
			attributes: {},
			getLabelStyle: () => ({ fontSize: 9 }),
			getShape: () => ({ update, setLocalScale }),
		}));
		let afterDraw: ((event: unknown) => void) | undefined;
		const graph = {
			on: vi.fn(
				(event: GraphEvent, listener: (event: unknown) => void) => {
					if (event === GraphEvent.AFTER_DRAW) afterDraw = listener;
				},
			),
			off: vi.fn(),
		};
		const controller = new G6LabelController(
			{ graph, element: { getElement } } as unknown as RuntimeContext,
			{ type: G6_LABEL_CONTROLLER_KEY, snapshot: createSnapshot() },
		);

		afterDraw?.({
			data: {
				dataChanges: [
					{ value: { id: 'A.md' } },
					{ value: { id: 'unrelated.md' } },
				],
			},
		});

		expect(getElement).toHaveBeenCalledOnce();
		expect(getElement).toHaveBeenCalledWith('A.md');
		expect(update).toHaveBeenCalledOnce();
		controller.destroy();
	});

	it('updates only dirty labels for transient interaction changes', () => {
		const update = vi.fn();
		const getElement = vi.fn(() => ({
			attributes: {},
			getLabelStyle: () => ({ fontSize: 9 }),
			getShape: () => ({ update, setLocalScale: vi.fn() }),
		}));
		const controller = new G6LabelController(
			{
				graph: { on: vi.fn(), off: vi.fn() },
				element: { getElement },
			} as unknown as RuntimeContext,
			{ type: G6_LABEL_CONTROLLER_KEY, snapshot: createSnapshot() },
		);

		controller.updateLabels(createSnapshot(), {
			nodeIds: new Set(['A.md']),
		});

		expect(getElement).toHaveBeenCalledOnce();
		expect(getElement).toHaveBeenCalledWith('A.md');
		controller.destroy();
	});

	it('removes stale Arc and HEB label placement before resolving plain labels', () => {
		const update = vi.fn();
		const setLocalScale = vi.fn();
		const getLabelStyle = vi.fn(() => ({
			transform: [['translate', 10, 0]],
		}));
		const getElement = vi.fn(() => ({
			attributes: {
				labelText: 'A',
				labelPlacement: 'center',
				labelOffsetX: 0,
				labelOffsetY: 0,
				labelTextAlign: 'left',
				labelTextBaseline: 'middle',
				labelTransform: [
					['translate', 20, 0],
					['rotate', 90],
				],
			},
			getLabelStyle,
			getShape: () => ({ update, setLocalScale }),
		}));
		const graph = { on: vi.fn(), off: vi.fn() };
		const controller = new G6LabelController(
			{ graph, element: { getElement } } as unknown as RuntimeContext,
			{
				type: G6_LABEL_CONTROLLER_KEY,
				snapshot: createSnapshot(),
			},
		);

		controller.updateLabels({
			...createSnapshot(),
			nodeStyle: {
				labelFontSize: 9,
				labelPlacement: 'right',
				labelOffsetX: 6,
				labelOffsetY: 0,
			},
		});

		expect(getLabelStyle).toHaveBeenCalledWith({
			labelText: 'A',
			labelFontSize: 9,
			labelPlacement: 'right',
			labelOffsetX: 6,
			labelOffsetY: 0,
		});
		expect(update).toHaveBeenCalledWith({
			transform: [['translate', 10, 0]],
		});
	});
});

function createSnapshot(): G6LabelControllerSnapshot {
	return {
		nodeIds: new Set(['A.md', 'missing.md']),
		edgeIds: new Set(),
		nodeStyle: { labelFontSize: 9 },
		edgeStyle: { labelFontSize: 9 },
	};
}
