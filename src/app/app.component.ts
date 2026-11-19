import { Component, computed, inject, signal } from "@angular/core";
import { ComposeAction, ComposeProject, DockerService } from "./docker.service";

type NoticeKind = "success" | "error" | "info";

@Component({
  selector: "app-root",
  imports: [],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  private readonly docker = inject(DockerService);

  readonly rootDirectory = signal<string | null>(null);
  readonly projects = signal<ComposeProject[]>([]);
  readonly selectedDirectory = signal<string | null>(null);
  readonly searchTerm = signal("");
  readonly scanning = signal(false);
  readonly choosingDirectory = signal(false);
  readonly busyDirectory = signal<string | null>(null);
  readonly loadingLogs = signal(false);
  readonly logs = signal<string | null>(null);
  readonly logsDirectory = signal<string | null>(null);
  readonly notice = signal<{ kind: NoticeKind; text: string } | null>(null);

  readonly runningCount = computed(() => this.projects().filter((project) => project.status === "running").length);
  readonly stoppedCount = computed(() => this.projects().filter((project) => project.status === "stopped").length);
  readonly selectedProject = computed(() => this.projects().find((project) => project.directory === this.selectedDirectory()) ?? null);
  readonly filteredProjects = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.projects();
    return this.projects().filter((project) =>
      project.name.toLowerCase().includes(term) ||
      project.relativeDirectory.toLowerCase().includes(term) ||
      project.composeFiles.some((file) => file.toLowerCase().includes(term)),
    );
  });

  constructor() {
    const savedDirectory = localStorage.getItem("compose-admin.root-directory");
    if (savedDirectory) {
      this.rootDirectory.set(savedDirectory);
      void this.refreshProjects();
    }
  }

  async chooseDirectory(): Promise<void> {
    this.choosingDirectory.set(true);
    try {
      const selected = await this.docker.chooseDirectory();
      if (!selected) return;
      this.rootDirectory.set(selected);
      localStorage.setItem("compose-admin.root-directory", selected);
      this.selectedDirectory.set(null);
      this.dismissLogs();
      await this.refreshProjects();
    } catch (error) {
      this.setNotice("error", this.errorMessage(error));
    } finally {
      this.choosingDirectory.set(false);
    }
  }

  async refreshProjects(): Promise<void> {
    const root = this.rootDirectory();
    if (!root) return;

    this.scanning.set(true);
    try {
      const projects = await this.docker.scanDirectory(root);
      this.projects.set(projects);
      const selected = this.selectedDirectory();
      if (!selected || !projects.some((project) => project.directory === selected)) {
        this.selectedDirectory.set(projects[0]?.directory ?? null);
      }
      this.clearNotice();
    } catch (error) {
      this.setNotice("error", this.errorMessage(error));
    } finally {
      this.scanning.set(false);
    }
  }

  selectProject(projectDirectory: string): void {
    this.selectedDirectory.set(projectDirectory);
    this.dismissLogs();
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  async runAction(project: ComposeProject, action: ComposeAction): Promise<void> {
    const root = this.rootDirectory();
    if (!root || this.busyDirectory()) return;

    this.busyDirectory.set(project.directory);
    this.setNotice("info", this.actionProgress(action, project.name));
    try {
      const result = await this.docker.runAction(root, project.directory, action);
      this.setNotice("success", result || this.actionSuccess(action, project.name));
      await this.refreshProjects();
    } catch (error) {
      this.setNotice("error", this.errorMessage(error));
    } finally {
      this.busyDirectory.set(null);
    }
  }

  async showLogs(project: ComposeProject): Promise<void> {
    const root = this.rootDirectory();
    if (!root) return;

    this.loadingLogs.set(true);
    this.logsDirectory.set(project.directory);
    this.logs.set(null);
    try {
      const result = await this.docker.getLogs(root, project.directory);
      this.logs.set(result || "Aucun log disponible pour ce projet.");
    } catch (error) {
      this.logs.set(this.errorMessage(error));
    } finally {
      this.loadingLogs.set(false);
    }
  }

  dismissLogs(): void {
    this.logs.set(null);
    this.logsDirectory.set(null);
  }

  isRunning(project: ComposeProject): boolean {
    return project.status === "running";
  }

  statusLabel(project: ComposeProject): string {
    if (project.status === "running") return "En cours";
    if (project.status === "stopped") return "Arrêté";
    return "Non vérifié";
  }

  private setNotice(kind: NoticeKind, text: string): void {
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
    };
    return action === "pull" ? `${labels[action]} pour ${name}…` : `${labels[action]} de ${name}…`;
  }

  private actionSuccess(action: ComposeAction, name: string): string {
    const labels: Record<ComposeAction, string> = {
      start: "démarré",
      stop: "arrêté",
      restart: "redémarré",
      pull: "images récupérées",
    };
    return `${name} : ${labels[action]}.`;
  }
}
