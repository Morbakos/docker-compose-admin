import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy,
	afterRenderEffect,
	Component,
	effect,
	ElementRef,
	inject,
	input,
	signal,
	viewChild,
} from "@angular/core";
import { DockerService, type ComposeOutput } from "@services";
import { appendComposeOutput } from "../compose-output-buffer";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [DatePipe],
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
