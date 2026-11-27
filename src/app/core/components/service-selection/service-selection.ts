import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [],
	selector: "app-service-selection",
	styleUrl: "./service-selection.scss",
	templateUrl: "./service-selection.html",
})
export class ServiceSelection {
	readonly services = input<string[]>([]);
	readonly selected = input<string[]>([]);
	readonly watchServices = input<string[]>([]);
	readonly toggled = output<string>();
	readonly selectAll = output<void>();
	readonly clear = output<void>();
}
