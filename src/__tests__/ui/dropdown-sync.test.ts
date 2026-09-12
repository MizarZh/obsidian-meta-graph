import { describe, expect, it, vi } from 'vitest';
import { DropdownSync } from '@/ui/obsidian/dropdown-sync';

function createControl() {
	const selectEl = {
		value: '',
		className: '',
		replaceChildren: vi.fn(),
		setAttribute: vi.fn(),
		removeAttribute: vi.fn(),
	} as unknown as HTMLSelectElement;
	return {
		selectEl,
		addOption: vi.fn(),
		setValue: vi.fn((value: string) => {
			selectEl.value = value;
		}),
		setDisabled: vi.fn(),
	};
}

const initial = {
	options: [
		{ value: '', label: 'No group' },
		{ value: 'a', label: 'A' },
	],
	value: '',
	disabled: false,
	className: 'group-select',
	ariaLabel: 'Group',
};

describe('dropdown synchronization', () => {
	it('never measures CSS-sized row controls on mount, value changes, or option changes', () => {
		for (let row = 0; row < 150; row++) {
			const control = createControl();
			const sync = new DropdownSync();
			const state = { ...initial, cssSized: true };
			sync.update(control, state);
			expect(control.selectEl.value).toBe('');
			sync.update(control, { ...state, value: 'a' });
			expect(control.selectEl.value).toBe('a');
			sync.update(control, {
				...state,
				value: 'a',
				options: [{ value: 'a', label: 'Renamed group' }],
			});
			expect(control.selectEl.value).toBe('a');
			expect(control.setValue).not.toHaveBeenCalled();
			expect(control.addOption).toHaveBeenLastCalledWith(
				'a',
				'Renamed group',
			);
		}
	});

	it('keeps the native dropdown class when applying and removing custom classes', () => {
		const control = createControl();
		const sync = new DropdownSync();
		sync.update(control, initial);
		expect(control.selectEl.className).toBe('dropdown group-select');
		sync.update(control, { ...initial, className: '' });
		expect(control.selectEl.className).toBe('dropdown');
		expect(control.setValue).toHaveBeenCalledOnce();
	});

	it('does no option writes or width measurements for 150 unchanged row dropdowns', () => {
		const rows = Array.from({ length: 150 }, () => ({
			sync: new DropdownSync(),
			control: createControl(),
		}));
		for (const { sync, control } of rows) sync.update(control, initial);
		for (let selection = 0; selection < 5; selection++) {
			for (const { sync, control } of rows) {
				sync.update(control, {
					...initial,
					options: initial.options.map((option) => ({ ...option })),
				});
			}
		}
		for (const { control } of rows) {
			expect(control.setValue).toHaveBeenCalledOnce();
			expect(control.selectEl.replaceChildren).toHaveBeenCalledOnce();
			expect(control.setDisabled).toHaveBeenCalledOnce();
			expect(control.selectEl.setAttribute).toHaveBeenCalledOnce();
		}
	});

	it('updates changed values without replacing options and follows native selection', () => {
		const control = createControl();
		const sync = new DropdownSync();
		sync.update(control, initial);
		sync.update(control, { ...initial, value: 'a' });
		expect(control.setValue).toHaveBeenCalledTimes(2);
		expect(control.selectEl.replaceChildren).toHaveBeenCalledOnce();
		control.selectEl.value = '';
		sync.update(control, initial);
		expect(control.setValue).toHaveBeenCalledTimes(2);
	});

	it('remeasures changed option labels and preserves requested selection', () => {
		const control = createControl();
		const sync = new DropdownSync();
		const state = {
			...initial,
			value: 'a',
			options: initial.options.map((option) => ({ ...option })),
		};
		sync.update(control, state);
		state.options[1]!.label = 'Renamed group';
		sync.update(control, state);
		expect(control.selectEl.replaceChildren).toHaveBeenCalledTimes(2);
		expect(control.addOption).toHaveBeenLastCalledWith(
			'a',
			'Renamed group',
		);
		expect(control.setValue).toHaveBeenLastCalledWith('a');
		expect(control.setValue).toHaveBeenCalledTimes(2);
	});

	it('updates disabled and accessible labels without measuring width', () => {
		const control = createControl();
		const sync = new DropdownSync();
		sync.update(control, initial);
		sync.update(control, {
			...initial,
			disabled: true,
			ariaLabel: undefined,
		});
		expect(control.setDisabled).toHaveBeenLastCalledWith(true);
		expect(control.selectEl.removeAttribute).toHaveBeenLastCalledWith(
			'aria-label',
		);
		expect(control.setValue).toHaveBeenCalledOnce();
	});
});
