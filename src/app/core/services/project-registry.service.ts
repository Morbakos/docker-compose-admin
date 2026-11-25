import { computed, inject, Injectable, signal } from "@angular/core";
import { DockerService, PersistedComposeProject } from "./docker.service";
import { parseLegacyServiceSelections } from "./legacy-service-selections";

/**
 * Owns the registered project catalog and the user's current project selection.
 * UI components consume its signals instead of coordinating persistence themselves.
 */
@Injectable({ providedIn: "root" })
export class ProjectRegistryService {
	readonly projects = signal<PersistedComposeProject[]>([]);
	readonly selectedDirectory = signal<string | null>(null);
	readonly scanning = signal(false);

	readonly selectedProject = computed(
		() => this.projects().find((project) => project.directory === this.selectedDirectory()) ?? null,
	);
	readonly selectedServices = computed(() => this.selectedProject()?.selectedServices ?? []);

	private readonly docker = inject(DockerService);
	private refreshPromise: Promise<void> | null = null;
	private refreshQueued = false;

	refresh(): Promise<void> {
		if (this.refreshPromise) {
			this.refreshQueued = true;
			return this.refreshPromise;
		}

		this.scanning.set(true);
		const refresh = async (): Promise<void> => {
			do {
				this.refreshQueued = false;
				const registered = await this.docker.listRegisteredProjects();
				const projects = await this.migrateLegacyServiceSelections(registered);
				this.projects.set(projects);
				const selected = this.selectedDirectory();
				if (!selected || !projects.some((project) => project.directory === selected)) {
					this.selectedDirectory.set(projects[0]?.directory ?? null);
				}
			} while (this.refreshQueued);
		};

		this.refreshPromise = refresh().finally(() => {
			this.scanning.set(false);
			this.refreshPromise = null;
		});
		return this.refreshPromise;
	}

	async addDirectory(directory: string): Promise<void> {
		const registered = await this.docker.addRegisteredProjects(directory);
		this.projects.set(await this.migrateLegacyServiceSelections(registered));
	}

	async removeProject(directory: string): Promise<void> {
		await this.docker.removeRegisteredProject(directory);
		this.projects.update((projects) => projects.filter((project) => project.directory !== directory));
		if (this.selectedDirectory() === directory) {
			this.selectedDirectory.set(this.projects()[0]?.directory ?? null);
		}
	}

	selectProject(directory: string): void {
		if (this.projects().some((project) => project.directory === directory)) {
			this.selectedDirectory.set(directory);
		}
	}

	async saveComposeFiles(project: PersistedComposeProject, files: string[]): Promise<void> {
		const updated = await this.docker.saveProjectComposeFiles(project.directory, files);
		this.projects.update((projects) => projects.map((item) =>
			item.directory === project.directory ? { ...item, ...updated } : item
		));
	}

	async saveServices(project: PersistedComposeProject, services: string[]): Promise<void> {
		await this.docker.saveProjectServices(project.directory, services);
		this.projects.update((projects) => projects.map((item) =>
			item.directory === project.directory ? { ...item, selectedServices: services } : item
		));
	}

	private async migrateLegacyServiceSelections(
		projects: PersistedComposeProject[],
	): Promise<PersistedComposeProject[]> {
		const raw = localStorage.getItem("compose-admin.service-selections");
		if (!raw) return projects;

		const legacy = parseLegacyServiceSelections(raw);
		if (!legacy) {
			localStorage.removeItem("compose-admin.service-selections");
			return projects;
		}

		const remaining = { ...legacy };
		const migrated = [...projects];
		for (let index = 0; index < migrated.length; index++) {
			const project = migrated[index];
			const previous = remaining[project.directory];
			if (!previous || !project.accessible) continue;

			const services = previous.filter((service) => project.services.includes(service));
			try {
				await this.docker.saveProjectServices(project.directory, services);
				migrated[index] = { ...project, selectedServices: services };
				delete remaining[project.directory];
			} catch (error) {
				console.warn("Unable to migrate saved service selection", error);
			}
		}

		if (Object.keys(remaining).length === 0) {
			localStorage.removeItem("compose-admin.service-selections");
		} else {
			localStorage.setItem("compose-admin.service-selections", JSON.stringify(remaining));
		}
		return migrated;
	}
}
