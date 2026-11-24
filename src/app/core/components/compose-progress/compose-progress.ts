import { DatePipe } from "@angular/common";
import {
	afterRenderEffect,
	Component,
	computed,
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
	private unlisten?: () => void;

	private readonly element = viewChild<ElementRef<HTMLDivElement>>("console");
	private readonly atBottom = signal(true);

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

		afterRenderEffect(() => {
			this.lines();

			const element = this.element()?.nativeElement;
			if (element && this.atBottom()) {
				element.scrollTop = element.scrollHeight;
			}
		});
	}

	toggleFullscreen(): void {
		this.fullscreen.update((value) => !value);
	}

	protected clearLogs() {
		this.lines.set([]);
	}

	@HostListener("document:keydown.escape")
	onEscape(): void {
		this.fullscreen.set(false);
	}

	protected onScroll() {
		const element = this.element()?.nativeElement;
		if (!element) {
			return;
		}
		this.atBottom.set(element.scrollHeight - element.scrollTop - element.clientHeight < 5);
	}

	ngOnDestroy(): void {
		this.unlisten?.();
	}
}
