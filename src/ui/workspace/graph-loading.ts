export interface GraphLoadingState {
	visible: boolean;
	label?: string;
}

export interface GraphLoadingCoordinatorOptions {
	waitForPaint(): Promise<void>;
	onChange(state: GraphLoadingState): void;
}

export class GraphLoadingCoordinator {
	private rendererPending = false;
	private transitionPending = false;
	private transitionLabel?: string;
	private transitionVersion = 0;

	constructor(private readonly options: GraphLoadingCoordinatorOptions) {}

	setRendererPending(pending: boolean): void {
		if (pending && !this.transitionPending && !this.rendererPending) {
			return;
		}
		if (this.rendererPending === pending) {
			return;
		}
		this.rendererPending = pending;
		this.publish();
	}

	async runTransition(
		label: string,
		transition: () => void | Promise<void>,
	): Promise<boolean> {
		const version = ++this.transitionVersion;
		this.transitionPending = true;
		this.transitionLabel = label;
		this.publish();

		try {
			await this.options.waitForPaint();
			if (version !== this.transitionVersion) {
				return false;
			}
			await transition();
			return true;
		} finally {
			if (version === this.transitionVersion) {
				this.transitionPending = false;
				this.transitionLabel = undefined;
				this.publish();
			}
		}
	}

	dispose(): void {
		this.transitionVersion += 1;
		this.rendererPending = false;
		this.transitionPending = false;
		this.transitionLabel = undefined;
		this.publish();
	}

	private publish(): void {
		this.options.onChange({
			visible: this.rendererPending || this.transitionPending,
			label: this.transitionLabel,
		});
	}
}

export function waitForGraphLoadingPaint(
	targetWindow: Pick<Window, 'requestAnimationFrame'>,
): Promise<void> {
	return new Promise((resolve) => {
		targetWindow.requestAnimationFrame(() => {
			targetWindow.requestAnimationFrame(() => resolve());
		});
	});
}
