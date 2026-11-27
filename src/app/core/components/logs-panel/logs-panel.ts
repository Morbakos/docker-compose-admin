import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from "@angular/core";
import { DockerService, SseService, type ComposeOutput } from "@services";
import { appendComposeOutput } from "../compose-output-buffer";
import { ActionConsole } from "../action-console/action-console";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ActionConsole],
	selector: "app-logs-panel",
	styleUrl: "./logs-panel.scss",
	templateUrl: "./logs-panel.html",
})
export class LogsPanel {
	readonly rootDirectory = input.required<string>();
	readonly projectDirectory = input.required<string>();
	readonly lines = signal<ComposeOutput[]>([]);
	readonly error = signal<string | null>(null);

	private readonly docker = inject(DockerService);
	private readonly sse = inject(SseService);

	constructor() {
		effect((onCleanup) => {
			const rootDirectory = this.rootDirectory();
			const projectDirectory = this.projectDirectory();
			let cancelled = false;
			let started = false;
			let unlisten: (() => void) | undefined;

			this.lines.set([]);
			this.error.set(null);

			this.sse.listenComposeOutput((output) => {
				this.lines.update((current) => appendComposeOutput(current, output, projectDirectory, "container"));
			}).then(async (stopListening) => {
				if (cancelled) {
					stopListening();
					return;
				}
				unlisten = stopListening;
				try {
					await this.docker.startComposeLogs(rootDirectory, projectDirectory);
					started = true;
					if (cancelled) await this.docker.stopComposeLogs(projectDirectory);
				} catch (error) {
					if (!cancelled) this.error.set(error instanceof Error ? error.message : String(error));
				}
			}).catch((error: unknown) => {
				if (!cancelled) this.error.set(error instanceof Error ? error.message : String(error));
			});

			onCleanup(() => {
				cancelled = true;
				unlisten?.();
				if (started) void this.docker.stopComposeLogs(projectDirectory);
			});
		});
	}

	protected clearLogs(): void {
		this.lines.set([]);
	}
}
