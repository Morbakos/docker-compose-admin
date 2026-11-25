import { Injectable, inject, signal } from "@angular/core";
import { DockerService } from "./docker.service";
import type { ComposeAction, ComposeContainer } from "./docker.service";
import { ProjectRegistryService } from "./project-registry.service";
import { AppErrorCatalogService } from "./app-error-catalog.service";

export type NoticeKind = "success" | "error" | "info";
export interface AppNotice {
	kind: NoticeKind;
	text: string;
}

/** Coordinates user-triggered Compose operations and their UI state. */
@Injectable({ providedIn: "root" })
export class ProjectEnvironmentService {
	private readonly docker = inject(DockerService);
	private readonly registry = inject(ProjectRegistryService);
	private readonly errorCatalog = inject(AppErrorCatalogService);

	readonly busyDirectory = signal<string | null>(null);
	readonly notice = signal<AppNotice | null>(null);
	readonly selectedProject = this.registry.selectedProject;
	readonly selectedServices = this.registry.selectedServices;

	setNotice(kind: NoticeKind, text: string): void {
		this.notice.set({ kind, text: kind === "error" ? this.errorCatalog.getUserMessage(text) : text });
	}

	clearNotice(): void {
		this.notice.set(null);
	}

	async runServiceAction(container: ComposeContainer, action: "start" | "stop" | "restart"): Promise<void> {
		const project = this.selectedProject();
		if (!project?.accessible || this.busyDirectory()) return;

		this.busyDirectory.set(project.directory);
		this.setNotice("info", action + " service " + container.service + "…");
		try {
			const result = await this.docker.runServiceAction(
				project.rootDirectory, project.directory, container.service, action,
			);
			this.setNotice("success", result || "Service " + container.service + " : " + action + " effectué.");
			await this.refreshAfterAction();
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
			await this.refreshAfterAction();
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		} finally {
			this.busyDirectory.set(null);
		}
	}

	async openApplication(url: string): Promise<void> {
		try {
			await this.docker.openExternalUrl(url);
		} catch (error) {
			this.setNotice("error", this.errorMessage(error));
		}
	}

	private async refreshAfterAction(): Promise<void> {
		try {
			await this.registry.refresh();
		} catch (error) {
			this.setNotice("error", "Action effectuée, mais impossible d’actualiser l’état du projet : " + this.errorMessage(error));
		}
	}

	private errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	private actionProgress(action: ComposeAction, name: string): string {
		const labels: Record<ComposeAction, string> = {
			start: "Démarrage", stop: "Arrêt", restart: "Redémarrage",
			pull: "Récupération des images", build: "Construction des images",
		};
		return action === "pull" || action === "build"
			? labels[action] + " pour " + name + "…"
			: labels[action] + " de " + name + "…";
	}

	private actionSuccess(action: ComposeAction, name: string): string {
		const labels: Record<ComposeAction, string> = {
			start: "démarré", stop: "arrêté", restart: "redémarré",
			pull: "images récupérées", build: "images construites",
		};
		return name + " : " + labels[action] + ".";
	}
}
