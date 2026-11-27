import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { ServiceSelection } from "../service-selection/service-selection";
import { ContainerList } from "../container-list/container-list";
import { LogsPanel } from "../logs-panel/logs-panel";
import type { ComposeProject, ComposeContainer } from "@bindings";
import { ComposeAction, DockerService } from "@services";
import { ComposeProgress } from "../compose-progress/compose-progress";
import { findApplicationUrl, orderComposeFiles } from "./workspace-configuration";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ServiceSelection, ContainerList, LogsPanel, ComposeProgress],
	selector: "app-project-workspace",
	styleUrl: "./project-workspace.scss",
	templateUrl: "./project-workspace.html",
})
export class ProjectWorkspace {
	readonly project = input.required<ComposeProject>();
	readonly orderedComposeFiles = computed(() => {
		const project = this.project();
		return orderComposeFiles(project.availableComposeFiles, project.composeFiles);
	});
	readonly containers = signal<ComposeContainer[]>([]);
	readonly containersLoading = signal(false);
	readonly containerLoadError = output<string>();
	private readonly docker = inject(DockerService);
	readonly selectedServices = input<string[]>([]);
	readonly watchServices = input<string[]>([]);
	readonly busy = input(false);
	readonly applicationUrl = computed(() => {
		return findApplicationUrl(this.containers());
	});
	readonly projectAction = output<ComposeAction>();
	readonly serviceToggle = output<string>();
	readonly composeFilesChange = output<string[]>();
	readonly selectAll = output<void>();
	readonly clearSelection = output<void>();
	readonly serviceAction = output<{
		container: ComposeContainer;
		action: "start" | "stop" | "restart";
	}>();
	readonly openApplication = output<string>();

	constructor() {
		effect((onCleanup) => {
			const project = this.project();
			let cancelled = false;
			onCleanup(() => { cancelled = true; });
			this.containers.set([]);
			if (!project.accessible) {
				this.containersLoading.set(false);
				return;
			}
			this.containersLoading.set(true);
			void this.docker.getContainers(project.rootDirectory, project.directory)
				.then((containers) => {
					if (!cancelled) this.containers.set(containers);
				})
				.catch((error: unknown) => {
					if (!cancelled) this.containerLoadError.emit(error instanceof Error ? error.message : String(error));
				})
				.finally(() => {
					if (!cancelled) this.containersLoading.set(false);
				});
		});
	}

	openApp(): void {
		const url = this.applicationUrl();
		if (url) this.openApplication.emit(url);
	}

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
