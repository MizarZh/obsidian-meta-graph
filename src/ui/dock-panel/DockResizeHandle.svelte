<script lang="ts">
	let {
		width,
		minWidth,
		maxWidth,
		ariaLabel,
		class: className,
		readDelta,
		onResize,
	}: {
		width: number;
		minWidth: number;
		maxWidth: number;
		ariaLabel: string;
		class: string;
		readDelta: (startX: number, currentX: number) => number;
		onResize: (width: number) => void;
	} = $props();

	function handlePointerDown(event: PointerEvent): void {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = width;
		function onMove(moveEvent: PointerEvent): void {
			const nextWidth = Math.max(
				minWidth,
				Math.min(maxWidth, startWidth + readDelta(startX, moveEvent.clientX)),
			);
			onResize(nextWidth);
		}
		function onUp(): void {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}
</script>

<div
	class={className}
	role="separator"
	aria-label={ariaLabel}
	onpointerdown={handlePointerDown}
></div>
