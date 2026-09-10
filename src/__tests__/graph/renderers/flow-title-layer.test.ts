import { describe, it, expect, vi } from 'vitest';
import Graphology from 'graphology';
import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import { FlowTitleLayer } from '@/graph/renderers/flow-title-layer';

/** Minimal DOM fixture: verifies actual reserved space, events and cleanup. */
function fixture(
	camera = { scale: 1, x: 0, y: 0 },
	labels = {
		size: 12,
		position: 'right' as const,
		offset: 4,
		bold: false,
		italic: false,
	},
) {
	const frames: FrameRequestCallback[] = [];
	const document = {
		defaultView: {
			requestAnimationFrame: (callback: FrameRequestCallback) =>
				frames.push(callback),
			cancelAnimationFrame: vi.fn(),
			getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
		},
		createElement: (_tag: string): Element => new Element(),
		createElementNS: (_ns: string, _tag: string): Element => new Element(),
	};
	class Element {
		ownerDocument = document;
		parentElement?: Element;
		children: Element[] = [];
		style = { right: '', setProperty: vi.fn() } as Record<
			string,
			unknown
		> & { right: string; setProperty: ReturnType<typeof vi.fn> };
		className = '';
		textContent = '';
		hidden = false;
		scrollTop = 0;
		listeners = new Map<string, (event: unknown) => void>();
		setAttribute = vi.fn();
		getContext = () => null;
		append(...children: Element[]) {
			children.forEach((child) => this.appendChild(child));
		}
		appendChild(child: Element) {
			child.remove();
			this.children.push(child);
			child.parentElement = this;
			return child;
		}
		remove() {
			if (this.parentElement)
				this.parentElement.children =
					this.parentElement.children.filter(
						(child) => child !== this,
					);
			this.parentElement = undefined;
		}
		replaceChildren() {
			this.children = [];
		}
		addEventListener(type: string, listener: (event: unknown) => void) {
			this.listeners.set(type, listener);
		}
		removeEventListener(type: string) {
			this.listeners.delete(type);
		}
		getBoundingClientRect() {
			return { width: this.style.right ? 420 : 600, height: 400 };
		}
	}
	const parent = new Element(),
		host = new Element();
	parent.appendChild(host);
	const graph = new Graphology() as RuntimeGraph;
	const resize = vi.fn();
	const select = vi.fn();
	const layer = new FlowTitleLayer({
		container: host as unknown as HTMLElement,
		getGraph: () => graph,
		toViewport: (point) => ({
			x: point.x * camera.scale + camera.x,
			y: point.y * camera.scale + camera.y,
		}),
		nodeRadius: (size) => size,
		readLabels: () => labels,
		resize,
	});
	return {
		parent,
		host,
		graph,
		layer,
		resize,
		select,
		flush: () => frames.splice(0).forEach((callback) => callback(0)),
	};
}

const group = {
	id: 'flow',
	name: 'Group 1',
	color: '#7567f8',
	mode: 'rule' as const,
	shape: 'rectangle' as const,
	padding: 0.3,
	x: 10,
	y: 10,
	width: 240,
	height: 180,
	titleBandHeight: 40,
};

describe('shared Flow title layer', () => {
	it('keeps the shared fixed font size and graph anchor through zoom, fit and pan', () => {
		const camera = { scale: 1, x: 0, y: 0 };
		const { host, parent, layer } = fixture(camera);
		layer.setGroups([group], {});
		const capsule = parent.children[1]!.children[0]!;
		for (const scale of [0.02, 0.25, 0.5, 1, 2, 4]) {
			Object.assign(camera, { scale, x: -350, y: 80 });
			layer.update();
			const actualScale = Number(
				String(capsule.style.transform).slice(6, -1),
			);
			expect(actualScale).toBe(1);
			expect(capsule.style.transformOrigin).toBe('0 0');
			expect(capsule.style.width).toBe('104px');
			const left = parseFloat(String(capsule.style.left)),
				top = parseFloat(String(capsule.style.top));
			expect(
				(left + (104 * actualScale) / 2 - camera.x) / scale,
			).toBeCloseTo(130);
			expect(
				(top + (24 * actualScale) / 2 - camera.y) / scale,
			).toBeCloseTo(170);
			expect(parent.children[1]!.children).toEqual([capsule]);
			expect(host.style.right).toBe('');
		}
		layer.destroy();
	});
	it('updates capsule size and font style from the shared resolved label settings', () => {
		const labels = {
			size: 12,
			position: 'right' as const,
			offset: 4,
			bold: false,
			italic: false,
		};
		const { parent, layer, resize } = fixture(
			{ scale: 0.1, x: 0, y: 0 },
			labels,
		);
		layer.setGroups([group], {});
		const capsule = parent.children[1]!.children[0]!;
		for (const size of [8, 16, 24, 32]) {
			Object.assign(labels, { size, bold: true, italic: true });
			layer.update();
			const scale = Number(String(capsule.style.transform).slice(6, -1));
			expect(
				Number.parseFloat(String(capsule.style.fontSize)) * scale,
			).toBeCloseTo(size);
			expect(capsule.style.fontWeight).toBe('600');
			expect(capsule.style.fontStyle).toBe('italic');
			expect(
				Number.parseFloat(String(capsule.style.left)) +
					(104 * scale) / 2,
			).toBeCloseTo(13);
			expect(
				Number.parseFloat(String(capsule.style.top)) + (24 * scale) / 2,
			).toBeCloseTo(17);
		}
		expect(resize).not.toHaveBeenCalled();
		layer.destroy();
	});
	it('uses the nominal capsule dimensions without consuming viewport space', () => {
		const { host, parent, layer } = fixture();
		layer.setGroups([group], {});
		expect(host.style.right).toBe('');
		const root = parent.children[1]!;
		const label = root.children.find(
			(child) => child.className === 'knowledge-workspace-flow-title',
		)!;
		expect(label.textContent).toBe('Group 1');
		expect(label.style.width).toBe('104px');
		layer.destroy();
		expect(parent.children).toEqual([host]);
	});

	it('anchors a capsule in the reserved band without a sidebar or viewport resizing', () => {
		const { host, parent, layer, resize, select, flush } = fixture();
		layer.setGroups([{ ...group, width: 704, height: 240 }], {
			onSelectGroup: select,
		});
		expect(host.getBoundingClientRect().width).toBe(600);
		flush();
		expect(resize).not.toHaveBeenCalled();
		const root = parent.children[1]!;
		const capsule = root.children.find(
			(child) => child.className === 'knowledge-workspace-flow-title',
		)!;
		expect(root.children).toEqual([capsule]);
		expect(capsule.textContent).toBe('Group 1');
		expect(capsule.style.top).toBe('218px');
		capsule.listeners.get('pointerdown')!({
			stopPropagation: vi.fn(),
		});
		expect(select).toHaveBeenCalledWith('flow');
		layer.destroy();
		expect(host.style.right).toBe('');
		expect(host.getBoundingClientRect().width).toBe(600);
	});
});
