import { DatePipe } from "@angular/common";
import { Component, effect, HostListener, inject, input, OnDestroy, signal } from "@angular/core";
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
	private unlisten?: () => void;

	constructor() {
		effect(() => {
			const directory = this.projectDirectory();
			this.lines.set([]);
			this.unlisten?.();
			this.docker
				.listenComposeOutput((output) => {
					if (output.projectDirectory !== directory) return;
					this.lines.update((current) => [...current, output]);
				})
				.then((unlisten) => (this.unlisten = unlisten));
		});
	}

	toggleFullscreen(): void {
		this.fullscreen.update((value) => !value);
	}

	@HostListener("document:keydown.escape")
	onEscape(): void {
		this.fullscreen.set(false);
	}

	ngOnDestroy(): void {
		this.unlisten?.();
	}
}
