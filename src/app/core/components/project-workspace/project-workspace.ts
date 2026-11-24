import { Component, input, output } from "@angular/core";
import { ServiceSelection } from "../service-selection/service-selection";
import { ContainerList } from "../container-list/container-list";
import { LogsPanel } from "../logs-panel/logs-panel";
import { ComposeProject, ComposeContainer } from "@bindings";
import { ComposeAction } from "@services";
import { ComposeProgress } from "../compose-progress/compose-progress";

@Component({
	imports: [ServiceSelection, ContainerList, LogsPanel, ComposeProgress],
	selector: "app-project-workspace",
	styleUrl: "./project-workspace.scss",
	templateUrl: "./project-workspace.html",
})
export class ProjectWorkspace {
	readonly project = input.required<ComposeProject>();
	readonly containers = input<ComposeContainer[]>([]);
	readonly containersLoading = input(false);
	readonly selectedServices = input<string[]>([]);
	readonly busy = input(false);
	readonly applicationUrl = input<string | null>(null);
	readonly logs = input<string | null>(null);
	readonly showingLogs = input(false);
	readonly loadingLogs = input(false);
	readonly projectAction = output<ComposeAction>();
	readonly serviceToggle = output<string>();
	readonly selectAll = output<void>();
	readonly clearSelection = output<void>();
	readonly serviceAction = output<{
		container: ComposeContainer;
		action: "start" | "stop" | "restart";
	}>();
	readonly openApplication = output<void>();
	readonly showLogs = output<void>();
	readonly closeLogs = output<void>();
}
