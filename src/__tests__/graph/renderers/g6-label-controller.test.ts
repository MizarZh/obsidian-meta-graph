import { GraphEvent, type RuntimeContext } from '@antv/g6';
import { describe, expect, it, vi } from 'vitest';
import {
	G6LabelController,
	G6_LABEL_CONTROLLER_KEY,
	type G6LabelControllerSnapshot,
} from '../../../graph/renderers/g6/g6-label-controller';

describe('G6 label controller', () => {
	it('updates only existing label subshapes and disables label picking', () => {
		const update = vi.fn();
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
						getShape: () => ({ update }),
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
		expect(getElement).toHaveBeenCalledWith('missing.md');

		controller.destroy();
		expect(graph.off).toHaveBeenCalledWith(
			GraphEvent.AFTER_DRAW,
			expect.any(Function),
		);
	});

	it('reapplies current styles only to elements changed by a G6 draw', () => {
		const update = vi.fn();
		const getElement = vi.fn(() => ({
			attributes: {},
			getLabelStyle: () => ({ fontSize: 9 }),
			getShape: () => ({ update }),
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
});

function createSnapshot(): G6LabelControllerSnapshot {
	return {
		nodeIds: new Set(['A.md', 'missing.md']),
		edgeIds: new Set(),
		nodeStyle: { labelFontSize: 9 },
		edgeStyle: { labelFontSize: 9 },
	};
}
