import { DatePipe } from "@angular/common";
import {
	afterRenderEffect,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostListener,
	input,
	output,
	signal,
	viewChild,
} from "@angular/core";
import type { ComposeOutput } from "@services";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [DatePipe],
	selector: "app-action-console",
	styleUrl: "./action-console.scss",
	templateUrl: "./action-console.html",
})
export class ActionConsole {
	readonly title = input.required<string>();
	readonly description = input<string | null>(null);
	readonly entries = input.required<ComposeOutput[]>();
	readonly error = input<string | null>(null);
	readonly isRunning = input(false);
	readonly clear = output<void>();
	readonly fullscreen = signal(false);

	private readonly consoleElement = viewChild<ElementRef<HTMLElement>>("console");

	constructor() {
		afterRenderEffect(() => {
			this.entries();
			this.error();
			const element = this.consoleElement()?.nativeElement;
			if (element) element.scrollTop = element.scrollHeight;
		});
	}

	toggleFullscreen(): void {
		this.fullscreen.update((value) => !value);
	}

	@HostListener("document:keydown.escape")
	onEscape(): void {
		this.fullscreen.set(false);
	}
}
