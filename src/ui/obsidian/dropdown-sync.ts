interface DropdownState {
	cssSized?: boolean;
	options: readonly { value: string; label: string }[];
	value: string;
	disabled: boolean;
	className: string;
	ariaLabel?: string;
}

interface DropdownControl {
	selectEl: HTMLSelectElement;
	addOption(value: string, label: string): unknown;
	setValue(value: string): unknown;
	setDisabled(disabled: boolean): unknown;
}

/** CSS-sized controls need no Obsidian width measurement, including on mount. */
export class DropdownSync {
	private previous?: DropdownState;

	update(control: DropdownControl, state: DropdownState): void {
		const previous = this.previous;
		const optionsChanged =
			!previous ||
			previous.options.length !== state.options.length ||
			state.options.some((option, index) => {
				const old = previous.options[index];
				return (
					old?.value !== option.value || old.label !== option.label
				);
			});

		if (optionsChanged) {
			control.selectEl.replaceChildren();
			for (const option of state.options) {
				control.addOption(option.value, option.label);
			}
		}
		if (!previous || previous.disabled !== state.disabled) {
			control.setDisabled(state.disabled);
		}
		if (!previous || previous.className !== state.className) {
			control.selectEl.className = ['dropdown', state.className]
				.filter(Boolean)
				.join(' ');
		}
		if (!previous || previous.ariaLabel !== state.ariaLabel) {
			if (state.ariaLabel) {
				control.selectEl.setAttribute('aria-label', state.ariaLabel);
			} else {
				control.selectEl.removeAttribute('aria-label');
			}
		}
		if (optionsChanged || control.selectEl.value !== state.value) {
			if (state.cssSized) control.selectEl.value = state.value;
			else control.setValue(state.value);
		}
		this.previous = {
			...state,
			options: optionsChanged
				? state.options.map((option) => ({ ...option }))
				: previous!.options,
		};
	}
}
