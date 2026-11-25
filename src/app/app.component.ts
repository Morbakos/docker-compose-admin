import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core";
import {
	BuildInfo,
	UpdateInfo,
	ComposeAction,
	ComposeContainer,
	DockerEngineStatusWithChecking,
	DockerService,
	PersistedComposeProject,
} from "./core/services/docker.service";
import { ProjectWorkspace } from "./core/components/project-workspace/project-workspace";
import { ProjectRegistryService } from "./core/services/project-registry.service";
import { NoticeKind, ProjectEnvironmentService } from "./core/services/project-environment.service";

type NoticeKind = "success" | "error" | "info";

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: "app-root",
	imports: [ProjectWorkspace],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.css",
})
export class AppComponent {
	private readonly docker = inject(DockerService);
	private readonly registry = inject(ProjectRegistryService);
	private readonly environment = inject(ProjectEnvironmentService);
	readonly projects = this.registry.projects;
	readonly scanning = this.registry.scanning;
	readonly selectedProject = this.registry.selectedProject;
	readonly selectedServices = this.registry.selectedServices;
	readonly buildInfo = signal<BuildInfo>({ version: "…", commit: "…", updaterEnabled: false });
	readonly availableUpdate = signal<UpdateInfo | null>(null);
	readonly checkingForUpdates = signal(false);
	readonly installingUpdate = signal(false);
	readonly dockerEngine = signal<DockerEngineStatusWithChecking>({
		connected: false,
		version: null,
		error: null,
		checking: true,
	});
	readonly choosingDirectory = signal(false);
	readonly busyDirectory = this.environment.busyDirectory;
	private updateCheckTimer: number | null = null;
	readonly notice = this.environment.notice;

	constructor() {
		const refreshTimer = window.setInterval(() => {
			void this.refreshDockerStatus();
			if (this.dockerEngine().connected && !this.scanning())
				void this.refreshProjects(true);
		}, 15000);
		inject(DestroyRef).onDestroy(() => {
			window.clearInterval(refreshTimer);
			if (this.updateCheckTimer !== null) window.clearInterval(this.updateCheckTimer);
		});
		void this.loadBuildInfo();
		this.updateCheckTimer = window.setInterval(() => void this.checkForUpdates(), 6 * 60 * 60 * 1000);
		void this.refreshDockerStatus();
		void this.refreshProjects();
	}

	async loadBuildInfo(): Promise<void> {
		try {
			const info = await this.docker.getBuildInfo();
			this.buildInfo.set(info);
			if (info.updaterEnabled) void this.checkForUpdates();
		} catch (error) {
			console.error("Unable to read application build information", error);
		}
	}

	async checkForUpdates(): Promise<void> {
		if (this.checkingForUpdates() || !this.buildInfo().updaterEnabled) return;
		this.checkingForUpdates.set(true);
		try {
			this.availableUpdate.set(await this.docker.checkForUpdate());
		} catch (error) {
			console.warn("Unable to check for application updates", error);
		} finally {
			this.checkingForUpdates.set(false);
		}
	}

	async installUpdate(): Promise<void> {
		const update = this.availableUpdate();
		if (!update || this.installingUpdate()) return;
		if (!window.confirm("Installer la version " + update.version + " et redémarrer Compose Admin ?")) return;
		this.installingUpdate.set(true);
		try {
			await this.docker.installUpdate(update.version);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
			this.installingUpdate.set(false);
		}
	}

	async chooseDirectory(): Promise<void> {
		this.choosingDirectory.set(true);
		try {
			const selected = await this.docker.chooseDirectory();
			if (!selected) return;
			const previousDirectories = new Set(this.projects().map((project) => project.directory));
			await this.registry.addDirectory(selected);
			const projects = this.projects();
			const added = projects.find((project) => !previousDirectories.has(project.directory) && project.accessible) ?? projects.find((project) => project.accessible);
			if (added) this.selectProject(added.directory);
			this.setNotice("success", "Projet ajouté à Compose Admin.");
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.choosingDirectory.set(false);
		}
	}

	async refreshDockerStatus(): Promise<void> {
		this.dockerEngine.update((current) => ({ ...current, checking: true }));
		try {
			this.dockerEngine.set({
				...(await this.docker.getEngineStatus()),
				checking: false,
			});
		} catch (error) {
			this.dockerEngine.set({
				connected: false,
				version: null,
				error: this.errorMessage(error),
				checking: false,
			});
		}
	}

	async refreshProjects(silent = false): Promise<void> {
		try {
			await this.registry.refresh();
			if (!silent) this.clearNotice();
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	async removeProject(project: PersistedComposeProject): Promise<void> {
		if (!window.confirm("Retirer « " + project.name + " » de Compose Admin ? Ses fichiers ne seront pas modifiés et un environnement Docker déjà lancé ne sera pas arrêté.")) return;
		try {
			await this.registry.removeProject(project.directory);
			this.setNotice("success", "Projet retiré de Compose Admin. Ses fichiers et les conteneurs existants n'ont pas été touchés.");
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	selectProject(directory: string): void {
		this.registry.selectProject(directory);
	}

	async saveComposeFiles(project: PersistedComposeProject, files: string[]): Promise<void> {
		if (files.length === 0) return;
		const wasRunning = this.isRunning(project);
		try {
			await this.registry.saveComposeFiles(project, files);
			if (wasRunning) {
				this.setNotice("info", "Fichiers Compose enregistrés. L’environnement est déjà démarré : redémarrez-le manuellement pour appliquer cette configuration.");
			} else {
				this.setNotice("success", "Fichiers Compose enregistrés.");
			}
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	async toggleService(service: string): Promise<void> {
		const project = this.selectedProject();
		if (!project || !project.accessible) return;
		const current = this.selectedServices();
		const next = current.includes(service) ? current.filter((item) => item !== service) : [...current, service];
		await this.saveSelectedServices(project, next);
	}
	async selectAllServices(): Promise<void> {
		const project = this.selectedProject();
		if (project) await this.saveSelectedServices(project, [...project.services]);
	}
	async clearSelectedServices(): Promise<void> {
		const project = this.selectedProject();
		if (project) await this.saveSelectedServices(project, []);
	}
	private async saveSelectedServices(project: PersistedComposeProject, services: string[]): Promise<void> {
		try {
			await this.registry.saveServices(project, services);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	async runServiceAction(container: ComposeContainer, action: "start" | "stop" | "restart"): Promise<void> {
		await this.environment.runServiceAction(container, action);
	}

	async runAction(action: ComposeAction): Promise<void> {
		await this.environment.runAction(action);
	}

	async openApplication(url: string): Promise<void> {
		await this.environment.openApplication(url);
	}
	isRunning(project: PersistedComposeProject): boolean {
		return project.status === "running";
	}
	statusLabel(project: PersistedComposeProject): string {
		return !project.accessible ? "Dossier introuvable" : project.status === "running" ? "En cours" : project.status === "stopped" ? "Arrêté" : "Non vérifié";
	}
	setNotice(kind: NoticeKind, text: string): void {
		this.environment.setNotice(kind, text);
	}
	clearNotice(): void {
		this.environment.clearNotice();
	}
	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
	private actionProgress(action: ComposeAction, name: string): string {
		const labels: Record<ComposeAction, string> = {
			start: "Démarrage",
			stop: "Arrêt",
			restart: "Redémarrage",
			pull: "Récupération des images",
			build: "Construction des images",
		};
		return action === "pull" || action === "build"
			? labels[action] + " pour " + name + "…"
			: labels[action] + " de " + name + "…";
	}
	private actionSuccess(action: ComposeAction, name: string): string {
		const labels: Record<ComposeAction, string> = {
			start: "démarré",
			stop: "arrêté",
			restart: "redémarré",
			pull: "images récupérées",
			build: "images construites",
		};
		return name + " : " + labels[action] + ".";
	}
}
