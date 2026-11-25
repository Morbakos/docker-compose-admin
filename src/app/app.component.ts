import { ChangeDetectionStrategy, Component, DestroyRef, inject } from "@angular/core";
import { ComposeAction, ComposeContainer, PersistedComposeProject } from "./core/services/docker.service";
import { ProjectWorkspace } from "./core/components/project-workspace/project-workspace";
import { ProjectEnvironmentService } from "./core/services/project-environment.service";
import { ProjectCatalogFacade } from "./core/services/project-catalog.facade";
import { ApplicationUpdateService } from "./core/services/application-update.service";
import { DockerEngineMonitorService } from "./core/services/docker-engine-monitor.service";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: "app-root",
	imports: [ProjectWorkspace],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.css",
})
export class AppComponent {
	private readonly catalog = inject(ProjectCatalogFacade);
	private readonly environment = inject(ProjectEnvironmentService);
	private readonly updates = inject(ApplicationUpdateService);
	private readonly engineMonitor = inject(DockerEngineMonitorService);

	readonly projects = this.catalog.projects;
	readonly scanning = this.catalog.scanning;
	readonly selectedProject = this.catalog.selectedProject;
	readonly selectedServices = this.catalog.selectedServices;
	readonly choosingDirectory = this.catalog.choosingDirectory;
	readonly busyDirectory = this.environment.busyDirectory;
	readonly notice = this.environment.notice;
	readonly buildInfo = this.updates.buildInfo;
	readonly availableUpdate = this.updates.availableUpdate;
	readonly checkingForUpdates = this.updates.checking;
	readonly installingUpdate = this.updates.installing;
	readonly dockerEngine = this.engineMonitor.status;

	constructor() {
		void this.catalog.refresh();
		const refreshTimer = window.setInterval(() => {
			if (this.dockerEngine().connected && !this.scanning()) void this.catalog.refresh(true);
		}, 15000);
		inject(DestroyRef).onDestroy(() => window.clearInterval(refreshTimer));
	}

	checkForUpdates(): Promise<void> {
		return this.updates.checkForUpdates();
	}

	async installUpdate(): Promise<void> {
		const update = this.availableUpdate();
		if (!update || this.installingUpdate()) return;
		if (!window.confirm("Installer la version " + update.version + " et redémarrer Compose Admin ?")) return;
		try {
			await this.updates.installUpdate();
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	chooseDirectory(): Promise<void> {
		return this.catalog.chooseDirectory();
	}

	refreshProjects(): Promise<void> {
		return this.catalog.refresh();
	}

	removeProject(project: PersistedComposeProject): void {
		if (!window.confirm("Retirer « " + project.name + " » de Compose Admin ? Ses fichiers ne seront pas modifiés et un environnement Docker déjà lancé ne sera pas arrêté.")) return;
		void this.catalog.removeProject(project);
	}

	selectProject(directory: string): void {
		this.catalog.selectProject(directory);
	}

	saveComposeFiles(project: PersistedComposeProject, files: string[]): Promise<void> {
		return this.catalog.saveComposeFiles(project, files);
	}

	toggleService(service: string): Promise<void> {
		return this.catalog.toggleService(service);
	}

	selectAllServices(): Promise<void> {
		return this.catalog.selectAllServices();
	}

	clearSelectedServices(): Promise<void> {
		return this.catalog.clearSelectedServices();
	}

	runServiceAction(container: ComposeContainer, action: "start" | "stop" | "restart"): Promise<void> {
		return this.environment.runServiceAction(container, action);
	}

	runAction(action: ComposeAction): Promise<void> {
		return this.environment.runAction(action);
	}

	openApplication(url: string): Promise<void> {
		return this.environment.openApplication(url);
	}

	isRunning(project: PersistedComposeProject): boolean {
		return this.catalog.isRunning(project);
	}

	statusLabel(project: PersistedComposeProject): string {
		return this.catalog.statusLabel(project);
	}

	setNotice(kind: "success" | "error" | "info", text: string): void {
		this.environment.setNotice(kind, text);
	}

	clearNotice(): void {
		this.environment.clearNotice();
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
