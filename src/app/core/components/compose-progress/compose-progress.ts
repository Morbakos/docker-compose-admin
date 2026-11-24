import { DatePipe } from "@angular/common";
import { Component, effect, inject, input, OnDestroy, signal } from "@angular/core";
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

	private readonly docker = inject(DockerService);

	private unlisten?: () => void;

	constructor() {
		effect(() => {
			const directory = this.projectDirectory();
			this.lines.set([]);
			this.unlisten?.();
			this.docker
				.listenComposeOutput((output) => {
					if (output.projectDirectory !== directory) {
						return;
					}
					this.lines.update((current) => [...current, output]);
				})
				.then((unlisten) => (this.unlisten = unlisten));
		});
	}

	ngOnDestroy(): void {
		this.unlisten?.();
	}
}
