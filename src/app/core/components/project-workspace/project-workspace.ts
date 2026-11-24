import { Component, computed, input, output } from "@angular/core";
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
	readonly orderedComposeFiles = computed(() => {
		const project = this.project();
		const selected = project.composeFiles.filter((file) => project.availableComposeFiles.includes(file));
		const unselected = project.availableComposeFiles.filter((file) => !project.composeFiles.includes(file));
		return [...selected, ...unselected];
	});
	readonly containers = input<ComposeContainer[]>([]);
	readonly containersLoading = input(false);
	readonly selectedServices = input<string[]>([]);
	readonly watchServices = input<string[]>([]);
	readonly busy = input(false);
	readonly applicationUrl = input<string | null>(null);
	readonly logs = input<string | null>(null);
	readonly loadingLogs = input(false);
	readonly projectAction = output<ComposeAction>();
	readonly serviceToggle = output<string>();
	readonly composeFilesChange = output<string[]>();
	readonly selectAll = output<void>();
	readonly clearSelection = output<void>();
	readonly serviceAction = output<{
		container: ComposeContainer;
		action: "start" | "stop" | "restart";
	}>();
	readonly openApplication = output<void>();

	toggleComposeFile(file: string, checked: boolean): void {
		const current = this.project().composeFiles;
		const next = checked ? [...current, file] : current.filter((item) => item !== file);
		if (next.length > 0) this.composeFilesChange.emit(next);
	}

	moveComposeFile(file: string, offset: number): void {
		const next = [...this.project().composeFiles];
		const index = next.indexOf(file);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		this.composeFilesChange.emit(next);
	}
}
