import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy,
	afterRenderEffect,
	Component,
	effect,
	ElementRef,
	HostListener,
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
	selector: "app-compose-progress",
	styleUrl: "./compose-progress.scss",
	templateUrl: "./compose-progress.html",
})
export class ComposeProgress {
	readonly projectDirectory = input.required<string>();
	readonly lines = signal<ComposeOutput[]>([]);
	readonly fullscreen = signal(false);

	private readonly docker = inject(DockerService);
	private readonly console = viewChild<ElementRef<HTMLDivElement>>("console");
	private unlisten?: () => void;

	constructor() {
		effect((onCleanup) => {
			const directory = this.projectDirectory();
			let cancelled = false;
			this.lines.set([]);

			this.docker.listenComposeOutput((output) => {
				this.lines.update((current) => appendComposeOutput(current, output, directory, "watch"));
			}).then((unlisten) => {
				if (cancelled) unlisten();
				else this.unlisten = unlisten;
			}).catch((error: unknown) => {
				console.error("Unable to subscribe to Compose output", error);
			});

			onCleanup(() => {
				cancelled = true;
				this.unlisten?.();
				this.unlisten = undefined;
			});
		});

		afterRenderEffect(() => {
			this.lines();
			const element = this.console()?.nativeElement;
			if (element) element.scrollTop = element.scrollHeight;
		});
	}

	protected toggleFullscreen(): void {
		this.fullscreen.update((value) => !value);
	}

	protected clearLogs(): void {
		this.lines.set([]);
	}

	@HostListener("document:keydown.escape")
	onEscape(): void {
		this.fullscreen.set(false);
	}
}
