import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotGroupCapsule } from '@/graph/renderers/export-capsule';
import { SvgDrawing } from '@/workspace/export/svg-drawing';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
	const context = {
		font: '',
		fillStyle: '',
		letterSpacing: '',
		scale: vi.fn(),
		beginPath: vi.fn(),
		roundRect: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		fillText: vi.fn(),
		measureText: (text: string) => ({ width: text.length * 6.025 }),
	};
	const canvas = {
		width: 0,
		height: 0,
		getContext: () => context,
		toDataURL: () => 'data:image/png;base64,test',
	};
	class Element {
		attributes = new Map<string, string>();
		children: Element[] = [];
		textContent = '';
		setAttribute(key: string, value: string) {
			this.attributes.set(key, value);
		}
		getAttribute(key: string) {
			return this.attributes.get(key);
		}
		appendChild(child: Element) {
			this.children.push(child);
		}
	}
	const image = new Element();
	const style = {
		display: 'block',
		width: '54.175px',
		height: '20px',
		boxSizing: 'border-box',
		transform: 'none',
		borderTopWidth: '1px',
		borderTopLeftRadius: '999px',
		backgroundColor: 'white',
		borderTopColor: 'blue',
		color: 'blue',
		fontStyle: 'normal',
		fontWeight: '600',
		fontSize: '11px',
		fontFamily: 'DocumentFont',
		letterSpacing: 'normal',
		paddingLeft: '5px',
		paddingRight: '5px',
	};
	const document = {
		defaultView: { getComputedStyle: () => style },
		createElement: (tag: string) => (tag === 'canvas' ? canvas : image),
		createElementNS: () => new Element(),
	};
	const source = {
		ownerDocument: document,
		offsetWidth: 54,
		offsetHeight: 20,
		textContent: 'Group 1',
	};
	vi.stubGlobal(
		'DOMMatrixReadOnly',
		class {
			a = 1;
			b = 0;
		},
	);
	return { context, canvas, image, document, source };
}

describe('Export group capsules', () => {
	it.each([1, 2, 3])(
		'keeps fractional CSS width, document font and complete text at %sx',
		(scale) => {
			const f = fixture();
			snapshotGroupCapsule(f.source as unknown as HTMLElement, scale);
			expect(f.image.getAttribute('width')).toBe('54.175');
			expect(f.canvas.width).toBe(Math.ceil(54.175 * scale));
			expect(f.context.font).toContain('DocumentFont');
			expect(f.context.fillText).toHaveBeenCalledWith('Group 1', 6, 10);
		},
	);
	it('exports native SVG capsule background, border and editable group-colored title', () => {
		const f = fixture();
		const drawing = new SvgDrawing(
			f.document as unknown as Document,
			'DocumentFont',
		);
		drawing.capsule(
			'Group 1',
			{ x: 50, y: 20 },
			'blue',
			'white',
			drawing.root,
		);
		const root = drawing.root as unknown as {
			children: (typeof f.image)[];
		};
		const group = root.children[0]!;
		expect(group.getAttribute('data-group-title')).toBe('Group 1');
		expect(group.children[0]!.getAttribute('rx')).toBe('10');
		expect(group.children[0]!.getAttribute('stroke')).toBe('blue');
		expect(group.children[1]!.textContent).toBe('Group 1');
		expect(group.children[1]!.getAttribute('fill')).toBe('blue');
	});
});
