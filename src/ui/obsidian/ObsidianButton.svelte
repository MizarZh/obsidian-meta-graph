<script lang="ts">
	import { ButtonComponent, type IconName } from "obsidian";
	import { onMount } from "svelte";

	let {
		text = "",
		icon,
		disabled = false,
		active = false,
		cta = false,
		destructive = false,
		tooltip,
		ariaLabel,
		role,
		class: className = "",
		onClick,
	}: {
		text?: string;
		icon?: IconName;
		disabled?: boolean;
		active?: boolean;
		cta?: boolean;
		destructive?: boolean;
		tooltip?: string;
		ariaLabel?: string;
		role?: string;
		class?: string;
		onClick?: (event: MouseEvent) => void;
	} = $props();

	let containerEl: HTMLSpanElement;
	let button: ButtonComponent | undefined;

	function callOptionalButtonMethod(name: string): void {
		const method = (button as unknown as Record<string, unknown> | undefined)?.[
			name
		];
		if (typeof method === "function") {
			method.call(button);
		}
	}

	onMount(() => {
		button = new ButtonComponent(containerEl);
		button.onClick((event) => onClick?.(event));

		return () => {
			containerEl.textContent = "";
			button = undefined;
		};
	});

	$effect(() => {
		if (!button) {
			return;
		}

		button.setButtonText(text);
		if (icon) {
			button.setIcon(icon);
		}
		button.setDisabled(disabled);
		button.buttonEl.className = className;
		button.buttonEl.classList.toggle("active", active);
		button.buttonEl.setAttribute("type", "button");
		if (ariaLabel) {
			button.buttonEl.setAttribute("aria-label", ariaLabel);
		} else {
			button.buttonEl.removeAttribute("aria-label");
		}
		if (role) {
			button.buttonEl.setAttribute("role", role);
		} else {
			button.buttonEl.removeAttribute("role");
		}
		if (tooltip) {
			button.setTooltip(tooltip);
		}
		if (cta) {
			callOptionalButtonMethod("setCta");
		} else {
			callOptionalButtonMethod("removeCta");
		}
		if (destructive) {
			callOptionalButtonMethod("setDestructive");
		} else {
			callOptionalButtonMethod("removeDestructive");
		}
		button.buttonEl.classList.toggle("mod-cta", cta);
		button.buttonEl.classList.toggle("mod-destructive", destructive);
	});
</script>

<span class="knowledge-workspace-obsidian-control" bind:this={containerEl}></span>
