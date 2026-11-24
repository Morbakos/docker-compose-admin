import { Component, input, output } from "@angular/core";
import { ComposeContainer } from "@bindings";

export interface ContainerActionResult {
	container: ComposeContainer;
	action: "start" | "stop" | "restart";
}

@Component({
	imports: [],
	selector: "app-container-list",
	styleUrl: "./container-list.scss",
	templateUrl: "./container-list.html",
})
export class ContainerList {
	public readonly containers = input.required<ComposeContainer[]>();
	public readonly loading = input.required();
	public readonly busy = input.required();
	public readonly action = output<ContainerActionResult>();
}
