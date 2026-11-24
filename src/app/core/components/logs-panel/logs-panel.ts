import { Component, input, output } from "@angular/core";

@Component({
	imports: [],
	selector: "app-logs-panel",
	styleUrl: "./logs-panel.scss",
	templateUrl: "./logs-panel.html",
})
export class LogsPanel {
	readonly logs = input<string | null>(null);
	readonly loading = input(false);
}
