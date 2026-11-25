import { Injectable, inject, signal } from "@angular/core";
import { DockerService } from "./docker.service";
import type { PersistedComposeProject } from "./docker.service";
import { ProjectRegistryService } from "./project-registry.service";
import { ProjectEnvironmentService } from "./project-environment.service";

@Injectable({ providedIn: "root" })
export class ProjectCatalogFacade {
	private readonly docker = inject(DockerService);
	private readonly registry = inject(ProjectRegistryService);
	private readonly environment = inject(ProjectEnvironmentService);

	readonly projects = this.registry.projects;
	readonly scanning = this.registry.scanning;
	readonly selectedProject = this.registry.selectedProject;
	readonly selectedServices = this.registry.selectedServices;
	readonly choosingDirectory = signal(false);

	async chooseDirectory(): Promise<void> {
		this.choosingDirectory.set(true);
		try {
			const directory = await this.docker.chooseDirectory();
			if (!directory) return;
			const previous = new Set(this.projects().map((project) => project.directory));
			await this.registry.addDirectory(directory);
			const projects = this.projects();
			const selected = projects.find((project) => !previous.has(project.directory) && project.accessible)
				?? projects.find((project) => project.accessible);
			if (selected) this.registry.selectProject(selected.directory);
			this.environment.setNotice("success", "Projet ajouté à Compose Admin.");
		} catch (error) {
			this.environment.setNotice("error", this.errorMessage(error));
		} finally {
			this.choosingDirectory.set(false);
		}
	}

	async refresh(silent = false): Promise<void> {
		try {
			await this.registry.refresh();
			if (!silent) this.environment.clearNotice();
		} catch (error) {
			this.environment.setNotice("error", this.errorMessage(error));
		}
	}

	async removeProject(project: PersistedComposeProject): Promise<void> {
		try {
			await this.registry.removeProject(project.directory);
			this.environment.setNotice("success", "Projet retiré de Compose Admin. Ses fichiers et les conteneurs existants n'ont pas été touchés.");
		} catch (error) {
			this.environment.setNotice("error", this.errorMessage(error));
		}
	}

	selectProject(directory: string): void {
		this.registry.selectProject(directory);
	}

	async saveComposeFiles(project: PersistedComposeProject, files: string[]): Promise<void> {
		if (files.length === 0) return;
		const wasRunning = project.status === "running";
		try {
			await this.registry.saveComposeFiles(project, files);
			this.environment.setNotice(
				wasRunning ? "info" : "success",
				wasRunning
					? "Fichiers Compose enregistrés. L’environnement est déjà démarré : redémarrez-le manuellement pour appliquer cette configuration."
					: "Fichiers Compose enregistrés.",
			);
		} catch (error) {
			this.environment.setNotice("error", this.errorMessage(error));
		}
	}

	async toggleService(service: string): Promise<void> {
		const project = this.selectedProject();
		if (!project?.accessible) return;
		const current = this.selectedServices();
		await this.saveServices(project, current.includes(service)
			? current.filter((item) => item !== service)
			: [...current, service]);
	}

	async selectAllServices(): Promise<void> {
		const project = this.selectedProject();
		if (project) await this.saveServices(project, [...project.services]);
	}

	async clearSelectedServices(): Promise<void> {
		const project = this.selectedProject();
		if (project) await this.saveServices(project, []);
	}

	private async saveServices(project: PersistedComposeProject, services: string[]): Promise<void> {
		try {
			await this.registry.saveServices(project, services);
		} catch (error) {
			this.environment.setNotice("error", this.errorMessage(error));
		}
	}

	isRunning(project: PersistedComposeProject): boolean {
		return project.status === "running";
	}


	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
