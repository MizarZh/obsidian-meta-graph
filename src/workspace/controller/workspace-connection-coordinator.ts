import type {
	DockConnectionDirection,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import {
	connectPreparedNodesInState,
	prepareConnectDockNoteInState,
	prepareConnectNodesInState,
	redoLastConnectionInState,
	undoLastConnectionInState,
	type WorkspaceConnectionActionResult,
} from '../actions/connection-actions';
import type { WorkspaceConnectionService } from '../services/connection-service';
import type { WorkspaceStore } from './workspace-store';

export interface WorkspaceConnectionCoordinatorOptions<TFile> {
	store: WorkspaceStore;
	service: WorkspaceConnectionService<TFile>;
	readOnly: boolean;
	commit(state: WorkspaceState, runQuery?: boolean): boolean;
	scheduleRefresh(forceLayout?: boolean): void;
}

export class WorkspaceConnectionCoordinator<TFile> {
	private relayoutFlowAfterConnection: boolean;

	constructor(
		private readonly options: WorkspaceConnectionCoordinatorOptions<TFile>,
		relayoutFlowAfterConnection: boolean,
	) {
		this.relayoutFlowAfterConnection = relayoutFlowAfterConnection;
	}

	setRelayoutFlowAfterConnection(value: boolean): void {
		this.relayoutFlowAfterConnection = value;
	}

	async connectDockNote(
		notePath: NodeId,
		targetNodeId: NodeId,
		direction: DockConnectionDirection,
		field: string,
	): Promise<void> {
		this.assertWritable();
		const action = prepareConnectDockNoteInState(
			this.options.store.snapshot,
			notePath,
			targetNodeId,
			direction,
			field,
		);
		if (!action) {
			return;
		}
		this.options.commit(action.state, action.runQuery);
		this.applyResult(
			await connectPreparedNodesInState(
				this.options.store.snapshot,
				this.options.service,
				action,
				this.relayoutFlowAfterConnection,
			),
		);
	}

	async connectNodes(
		sourceNodeId: NodeId,
		targetNodeId: NodeId,
		field: string,
	): Promise<void> {
		this.assertWritable();
		const action = prepareConnectNodesInState(
			this.options.store.snapshot,
			sourceNodeId,
			targetNodeId,
			field,
		);
		if (!action) {
			return;
		}
		this.options.commit(action.state, action.runQuery);
		this.applyResult(
			await connectPreparedNodesInState(
				this.options.store.snapshot,
				this.options.service,
				action,
				this.relayoutFlowAfterConnection,
			),
		);
	}

	async undoLastConnection(): Promise<void> {
		this.assertWritable();
		this.applyResult(
			await undoLastConnectionInState(
				this.options.store.snapshot,
				this.options.service,
			),
		);
	}

	async redoLastConnection(): Promise<void> {
		this.assertWritable();
		this.applyResult(
			await redoLastConnectionInState(
				this.options.store.snapshot,
				this.options.service,
			),
		);
	}

	private applyResult(result: WorkspaceConnectionActionResult): void {
		this.options.commit(result.state);
		if (result.refresh) {
			this.options.scheduleRefresh(result.forceLayout);
		}
	}

	private assertWritable(): void {
		if (this.options.readOnly) {
			throw new Error(
				'This Meta Graph uses a newer format and is read-only.',
			);
		}
	}
}
