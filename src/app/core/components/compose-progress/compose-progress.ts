import { DatePipe } from "@angular/common";
import {
	afterRenderEffect,
	Component,
	effect,
	ElementRef,
	HostListener,
	inject,
	input,
	OnDestroy,
	signal,
	viewChild,
} from "@angular/core";
import { ComposeOutput, DockerService } from "@services";

@Component({
	imports: [DatePipe],
	selector: "app-compose-progress",
	styleUrl: "./compose-progress.scss",
	templateUrl: "./compose-progress.html",
})
export class ComposeProgress implements OnDestroy {
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
			this.unlisten?.();
			this.unlisten = undefined;

			this.docker.listenComposeOutput((output) => {
				if (output.projectDirectory === directory && output.source === "watch") {
					this.lines.update((current) => [...current, output]);
				}
			}).then((unlisten) => {
				if (cancelled) unlisten();
				else this.unlisten = unlisten;
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

	ngOnDestroy(): void {
		this.unlisten?.();
	}
}
