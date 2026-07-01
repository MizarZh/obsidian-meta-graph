import { describe, expect, it } from 'vitest';
import { buildCuratedMultiDragOrder } from '../ui/curated/curated-multi-drag';

describe('curated multi drag', () => {
	it('moves selected files as one block after a drop target', () => {
		expect(
			buildCuratedMultiDragOrder({
				orderedPaths: ['A.md', 'B.md', 'C.md', 'D.md', 'E.md', 'F.md'],
				draggedPath: 'D.md',
				selectedPaths: new Set(['B.md', 'D.md', 'E.md']),
				singleDraggedOrder: [
					'A.md',
					'B.md',
					'C.md',
					'E.md',
					'F.md',
					'D.md',
				],
			}),
		).toEqual(['A.md', 'C.md', 'F.md', 'B.md', 'D.md', 'E.md']);
	});

	it('moves selected files before a drop target', () => {
		expect(
			buildCuratedMultiDragOrder({
				orderedPaths: ['A.md', 'B.md', 'C.md', 'D.md', 'E.md', 'F.md'],
				draggedPath: 'D.md',
				selectedPaths: new Set(['B.md', 'D.md', 'E.md']),
				singleDraggedOrder: [
					'D.md',
					'A.md',
					'B.md',
					'C.md',
					'E.md',
					'F.md',
				],
			}),
		).toEqual(['B.md', 'D.md', 'E.md', 'A.md', 'C.md', 'F.md']);
	});

	it('uses single dragged order when dragged file is not selected', () => {
		expect(
			buildCuratedMultiDragOrder({
				orderedPaths: ['A.md', 'B.md', 'C.md'],
				draggedPath: 'C.md',
				selectedPaths: new Set(['A.md', 'B.md']),
				singleDraggedOrder: ['C.md', 'A.md', 'B.md'],
			}),
		).toEqual(['C.md', 'A.md', 'B.md']);
	});

	it('returns original order for invalid reordered paths', () => {
		expect(
			buildCuratedMultiDragOrder({
				orderedPaths: ['A.md', 'B.md', 'C.md'],
				draggedPath: 'B.md',
				selectedPaths: new Set(['A.md', 'B.md']),
				singleDraggedOrder: ['B.md', 'A.md'],
			}),
		).toEqual(['A.md', 'B.md', 'C.md']);
	});
});
