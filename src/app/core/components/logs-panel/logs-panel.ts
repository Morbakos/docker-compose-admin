import {
	afterRenderEffect,
	Component,
	effect,
	ElementRef,
	inject,
	input,
	signal,
	viewChild,
} from "@angular/core";
import { ComposeOutput, DockerService } from "@services";

@Component({
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
	private readonly console = viewChild<ElementRef<HTMLElement>>("console");

	constructor() {
		effect((onCleanup) => {
			const rootDirectory = this.rootDirectory();
			const projectDirectory = this.projectDirectory();
			let cancelled = false;
			let started = false;
			let unlisten: (() => void) | undefined;

			this.lines.set([]);
			this.error.set(null);

			this.docker.listenComposeOutput((output) => {
				if (output.projectDirectory === projectDirectory && output.source === "container") {
					this.lines.update((current) => [...current, output]);
				}
			}).then(async (stopListening) => {
				if (cancelled) {
					stopListening();
					return;
				}
				unlisten = stopListening;
				try {
					await this.docker.startComposeLogs(rootDirectory, projectDirectory);
					started = true;
					if (cancelled) await this.docker.stopComposeLogs(rootDirectory, projectDirectory);
				} catch (error) {
					this.error.set(error instanceof Error ? error.message : String(error));
				}
			}).catch((error: unknown) => {
				this.error.set(error instanceof Error ? error.message : String(error));
			});

			onCleanup(() => {
				cancelled = true;
				unlisten?.();
				if (started) void this.docker.stopComposeLogs(rootDirectory, projectDirectory);
			});
		});

		afterRenderEffect(() => {
			this.lines();
			this.error();
			const element = this.console()?.nativeElement;
			if (element) element.scrollTop = element.scrollHeight;
		});
	}

	protected clearLogs(): void {
		this.lines.set([]);
	}
}
