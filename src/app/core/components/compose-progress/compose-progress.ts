import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from "@angular/core";
import { SseService, type ComposeOutput } from "@services";
import { appendComposeOutput } from "../compose-output-buffer";
import { ActionConsole } from "../action-console/action-console";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ActionConsole],
	selector: "app-compose-progress",
	styleUrl: "./compose-progress.scss",
	templateUrl: "./compose-progress.html",
})
export class ComposeProgress {
	readonly projectDirectory = input.required<string>();
	readonly source = input<ComposeOutput["source"]>("watch");
	readonly title = input("Activité au démarrage");
	readonly isRunning = input(false);
	readonly lines = signal<ComposeOutput[]>([]);
	private readonly sse = inject(SseService);

	constructor() {
		effect((onCleanup) => {
			const directory = this.projectDirectory();
			let cancelled = false;
			let unlisten: (() => void) | undefined;
			this.lines.set([]);

			this.sse.listenComposeOutput((output) => {
				this.lines.update((current) => appendComposeOutput(current, output, directory, this.source()));
			}).then((stopListening) => {
				if (cancelled) stopListening();
				else unlisten = stopListening;
			}).catch((error: unknown) => console.error("Unable to subscribe to process output", error));

			onCleanup(() => {
				cancelled = true;
				unlisten?.();
			});
		});
	}

	protected clearLogs(): void {
		this.lines.set([]);
	}
}
