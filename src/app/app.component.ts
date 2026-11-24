import { Component, computed, DestroyRef, inject, signal } from "@angular/core";
import {
	BuildInfo,
	UpdateInfo,
	ComposeAction,
	ComposeContainer,
	ComposeProject,
	DockerEngineStatusWithChecking,
	DockerService,
	PersistedComposeProject,
} from "./core/services/docker.service";
import { ProjectWorkspace } from "./core/components/project-workspace/project-workspace";

type NoticeKind = "success" | "error" | "info";

@Component({
	selector: "app-root",
	imports: [ProjectWorkspace],
	templateUrl: "./app.component.html",
	styleUrl: "./app.component.css",
})
export class AppComponent {
	private readonly docker = inject(DockerService);
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
	readonly projects = signal<PersistedComposeProject[]>([]);
	readonly selectedDirectory = signal<string | null>(null);
	readonly scanning = signal(false);
	readonly choosingDirectory = signal(false);
	readonly busyDirectory = signal<string | null>(null);
	readonly loadingLogs = signal(false);
	readonly logs = signal<string | null>(null);
	readonly logsDirectory = signal<string | null>(null);
	readonly containers = signal<ComposeContainer[]>([]);
	readonly containersLoading = signal(false);
	private logRefreshTimer: number | null = null;
	private updateCheckTimer: number | null = null;
	private logRequestActive = false;
	readonly notice = signal<{ kind: NoticeKind; text: string } | null>(null);

	readonly selectedProject = computed(
		() => this.projects().find((project) => project.directory === this.selectedDirectory()) ?? null,
	);
	readonly selectedServices = computed(() => this.selectedProject()?.selectedServices ?? []);

	constructor() {
		const refreshTimer = window.setInterval(() => {
			void this.refreshDockerStatus();
			if (this.dockerEngine().connected && !this.scanning())
				void this.refreshProjects(true);
		}, 15000);
		inject(DestroyRef).onDestroy(() => {
			window.clearInterval(refreshTimer);
			if (this.updateCheckTimer !== null) window.clearInterval(this.updateCheckTimer);
			this.stopLogPolling();
		});
		void this.loadBuildInfo();
		this.updateCheckTimer = window.setInterval(() => void this.checkForUpdates(), 6 * 60 * 60 * 1000);
		void this.refreshDockerStatus();
		void this.refreshProjects();

		this.docker.listenComposeOutput((output) => console.log(output));
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
			const projects = await this.docker.addRegisteredProjects(selected);
			this.projects.set(projects);
			const added = projects.find((project) => project.rootDirectory === selected && project.accessible);
			if (added) this.selectProject(added.directory);
			this.setNotice("success", "Projet(s) ajouté(s) à Compose Admin.");
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
		if (this.scanning()) return;
		this.scanning.set(true);
		try {
			const projects = await this.docker.listRegisteredProjects();
			this.projects.set(projects);
			const selected = this.selectedDirectory();
			if (!selected || !projects.some((project) => project.directory === selected))
				this.selectedDirectory.set(projects[0]?.directory ?? null);
			const chosen = projects.find((project) => project.directory === this.selectedDirectory());
			if (chosen?.accessible) void this.refreshContainers(chosen);
			else this.containers.set([]);
			if (!silent) this.clearNotice();
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.scanning.set(false);
		}
	}
	async removeProject(project: PersistedComposeProject): Promise<void> {
		if (!window.confirm("Retirer « " + project.name + " » de Compose Admin ? Ses fichiers et son environnement Docker ne seront pas modifiés.")) return;
		try {
			await this.docker.removeRegisteredProject(project.directory);
			if (this.selectedDirectory() === project.directory) {
				this.selectedDirectory.set(null);
				this.dismissLogs();
				this.containers.set([]);
			}
			await this.refreshProjects(true);
			this.setNotice("success", "Projet retiré de Compose Admin. Aucun fichier du projet n'a été modifié.");
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	selectProject(directory: string): void {
		this.selectedDirectory.set(directory);
		this.dismissLogs();
		const project = this.projects().find((project) => project.directory === directory);
		if (project) void this.refreshContainers(project);
	}

	async refreshContainers(project: PersistedComposeProject): Promise<void> {
		if (!project.accessible) return;
		const root = project.rootDirectory;
		this.containersLoading.set(true);
		try {
			this.containers.set(await this.docker.getContainers(root, project.directory));
		} catch (error) {
			this.containers.set([]);
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.containersLoading.set(false);
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
			await this.docker.saveProjectServices(project.directory, services);
			this.projects.update((projects) => projects.map((item) =>
				item.directory === project.directory ? { ...item, selectedServices: services } : item
			));
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	async runServiceAction(container: ComposeContainer, action: "start" | "stop" | "restart"): Promise<void> {
		const project = this.selectedProject();
		if (!project?.accessible || this.busyDirectory()) return;
		this.busyDirectory.set(project.directory);
		this.setNotice("info", action + " service " + container.service + "…");
		try {
			const result = await this.docker.runServiceAction(project.rootDirectory, project.directory, container.service, action);
			this.setNotice("success", result || "Service " + container.service + " : " + action + " effectué.");
			await this.refreshContainers(project);
			await this.refreshProjects(true);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.busyDirectory.set(null);
		}
	}

	async runAction(action: ComposeAction): Promise<void> {
		const project = this.selectedProject();
		if (!project?.accessible || this.busyDirectory()) return;
		const services = this.selectedServices();
		if ((action === "start" || action === "restart" || action === "build") && services.length === 0) {
			this.setNotice("error", "Sélectionnez au moins un service à démarrer.");
			return;
		}
		this.busyDirectory.set(project.directory);
		this.setNotice("info", this.actionProgress(action, project.name));
		try {
			const result = await this.docker.runAction(project.rootDirectory, project.directory, action, services);
			this.setNotice("success", result || this.actionSuccess(action, project.name));
			await this.refreshProjects(true);
			const refreshed = this.selectedProject();
			if (refreshed) await this.refreshContainers(refreshed);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.busyDirectory.set(null);
		}
	}

	async showLogs(): Promise<void> {
		const project = this.selectedProject();
		if (!project?.accessible) return;
		this.loadingLogs.set(true);
		this.logsDirectory.set(project.directory);
		this.logs.set(null);
		try {
			this.logs.set(
				(await this.docker.getLogs(project.rootDirectory, project.directory)) || "Aucun log disponible pour ce projet.",
			);
			this.startLogPolling(project);
		} catch (error) {
			this.logs.set(this.errorMessage(error));
		} finally {
			this.loadingLogs.set(false);
		}
	}
	dismissLogs(): void {
		this.stopLogPolling();
		this.logs.set(null);
		this.logsDirectory.set(null);
	}
	private startLogPolling(project: PersistedComposeProject): void {
		this.stopLogPolling();
		this.logRefreshTimer = window.setInterval(() => void this.pollLogs(project), 3000);
	}
	private stopLogPolling(): void {
		if (this.logRefreshTimer !== null) window.clearInterval(this.logRefreshTimer);
		this.logRefreshTimer = null;
		this.logRequestActive = false;
	}
	private async pollLogs(project: PersistedComposeProject): Promise<void> {
		if (!project.accessible || this.logRequestActive || this.logsDirectory() !== project.directory) return;
		this.logRequestActive = true;
		try {
			this.logs.set(
				(await this.docker.getLogs(root, project.directory)) || "Aucun log disponible pour ce projet.",
			);
		} catch (error) {
			this.logs.set(this.errorMessage(error));
		} finally {
			this.logRequestActive = false;
		}
	}

	applicationUrl(): string | null {
		for (const container of this.containers())
			for (const port of container.ports) {
				const url = this.portUrl(port);
				if (url) return url;
			}
		return null;
	}
	async openApplication(): Promise<void> {
		const url = this.applicationUrl();
		if (!url) {
			this.setNotice("info", "Aucun port HTTP publié détecté pour cette application.");
			return;
		}
		try {
			await this.docker.openExternalUrl(url);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}
	portUrl(port: string): string | null {
		const match = port.match(/^(?:[^:]+:)?(\d+):(\d+)(?:\/(tcp|udp))?$/i);
		return match && (!match[3] || match[3].toLowerCase() === "tcp") ? "http://localhost:" + match[1] : null;
	}
	isRunning(project: PersistedComposeProject): boolean {
		return project.status === "running";
	}
	statusLabel(project: PersistedComposeProject): string {
		return !project.accessible ? "Dossier introuvable" : project.status === "running" ? "En cours" : project.status === "stopped" ? "Arrêté" : "Non vérifié";
	}
	setNotice(kind: NoticeKind, text: string): void {
		this.notice.set({ kind, text });
	}
	clearNotice(): void {
		this.notice.set(null);
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
