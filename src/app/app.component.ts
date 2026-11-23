import { Component, computed, DestroyRef, inject, signal } from "@angular/core";
import { ComposeAction, ComposeContainer, ComposeProject, DockerEngineStatusWithChecking, DockerService } from "./docker.service";

type NoticeKind = "success" | "error" | "info";

@Component({
  selector: "app-root",
  imports: [],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  private readonly docker = inject(DockerService);

  readonly dockerEngine = signal<DockerEngineStatusWithChecking>({ connected: false, version: null, error: null, checking: true });
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
  readonly containers = signal<ComposeContainer[]>([]);
  readonly containersLoading = signal(false);
  readonly serviceSelections = signal<Record<string, string[]>>({});
  private logRefreshTimer: number | null = null;
  private logRequestActive = false;
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
    const savedSelections = localStorage.getItem("compose-admin.service-selections");
    if (savedSelections) {
      try {
        this.serviceSelections.set(JSON.parse(savedSelections) as Record<string, string[]>);
      } catch {
        localStorage.removeItem("compose-admin.service-selections");
      }
    }

    const refreshTimer = window.setInterval(() => {
      void this.refreshDockerStatus();
      if (this.dockerEngine().connected && this.rootDirectory() && !this.scanning()) {
        void this.refreshProjects(true);
      }
    }, 15000);
    inject(DestroyRef).onDestroy(() => { window.clearInterval(refreshTimer); this.stopLogPolling(); });
    void this.refreshDockerStatus();
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
      await this.refreshProjects(true);
    } catch (error) {
      this.setNotice("error", this.errorMessage(error));
    } finally {
      this.choosingDirectory.set(false);
    }
  }

  async refreshDockerStatus(): Promise<void> {
    this.dockerEngine.update((current) => ({ ...current, checking: true }));
    try {
      const status = await this.docker.getEngineStatus();
      this.dockerEngine.set({ ...status, checking: false });
    } catch (error) {
      this.dockerEngine.set({ connected: false, version: null, error: this.errorMessage(error), checking: false });
    }
  }

  async refreshProjects(silent = false): Promise<void> {
    if (this.scanning()) return;
    const root = this.rootDirectory();
    if (!root) return;

    this.scanning.set(true);
    try {
      const projects = await this.docker.scanDirectory(root);
      this.projects.set(projects);
      const previousSelections = this.serviceSelections();
      const nextSelections: Record<string, string[]> = {};
      for (const project of projects) {
        const previous = previousSelections[project.directory];
        if (previous !== undefined) {
          nextSelections[project.directory] = project.services.length > 0
            ? previous.filter((service) => project.services.includes(service))
            : previous;
        } else if (project.services.length > 0) {
          nextSelections[project.directory] = [...project.services];
        }
      }
      this.serviceSelections.set(nextSelections);
      this.persistServiceSelections();
      const selected = this.selectedDirectory();
      if (!selected || !projects.some((project) => project.directory === selected)) {
        this.selectedDirectory.set(projects[0]?.directory ?? null);
      }
      const chosen = projects.find(p => p.directory === this.selectedDirectory());
      if (chosen) void this.refreshContainers(chosen); else this.containers.set([]);
      if (!silent) this.clearNotice();
    } catch (error) {
      this.setNotice("error", this.errorMessage(error));
    } finally {
      this.scanning.set(false);
    }
  }

  selectProject(projectDirectory: string): void {
    this.selectedDirectory.set(projectDirectory);
    this.dismissLogs();
    const project = this.projects().find(p => p.directory === projectDirectory);
    if (project) void this.refreshContainers(project);
  }

  async refreshContainers(project: ComposeProject): Promise<void> {
    const root = this.rootDirectory();
    if (!root) return;
    this.containersLoading.set(true);
    try { this.containers.set(await this.docker.getContainers(root, project.directory)); }
    catch (error) { this.containers.set([]); this.setNotice("error", this.errorMessage(error)); }
    finally { this.containersLoading.set(false); }
  }

  selectedServices(project: ComposeProject): string[] {
    return this.serviceSelections()[project.directory] ?? project.services;
  }

  isServiceSelected(project: ComposeProject, service: string): boolean {
    return this.selectedServices(project).includes(service);
  }

  toggleService(project: ComposeProject, service: string): void {
    const current = this.selectedServices(project);
    const next = current.includes(service)
      ? current.filter((item) => item !== service)
      : [...current, service];
    this.serviceSelections.update((selections) => ({ ...selections, [project.directory]: next }));
    this.persistServiceSelections();
  }

  selectAllServices(project: ComposeProject): void {
    this.serviceSelections.update((selections) => ({ ...selections, [project.directory]: [...project.services] }));
    this.persistServiceSelections();
  }

  clearSelectedServices(project: ComposeProject): void {
    this.serviceSelections.update((selections) => ({ ...selections, [project.directory]: [] }));
    this.persistServiceSelections();
  }

  private persistServiceSelections(): void {
    localStorage.setItem("compose-admin.service-selections", JSON.stringify(this.serviceSelections()));
  }

  async runServiceAction(container: ComposeContainer, action: "start" | "stop" | "restart"): Promise<void> {
    const root = this.rootDirectory(), project = this.selectedProject();
    if (!root || !project || this.busyDirectory()) return;
    this.busyDirectory.set(project.directory);
    this.setNotice("info", action + " service " + container.service + "…");
    try {
      const result = await this.docker.runServiceAction(root, project.directory, container.service, action);
      this.setNotice("success", result || ("Service " + container.service + " : " + action + " effectué."));
      await this.refreshContainers(project);
      await this.refreshProjects(true);
    } catch (error) { this.setNotice("error", this.errorMessage(error)); }
    finally { this.busyDirectory.set(null); }
  }

  setSearchTerm(value: string): void {
    this.searchTerm.set(value);
  }

  async runAction(project: ComposeProject, action: ComposeAction): Promise<void> {
    const root = this.rootDirectory();
    if (!root || this.busyDirectory()) return;

    const services = this.selectedServices(project);
    if ((action === "start" || action === "restart") && services.length === 0) {
      this.setNotice("error", "Sélectionnez au moins un service à démarrer.");
      return;
    }

    this.busyDirectory.set(project.directory);
    this.setNotice("info", this.actionProgress(action, project.name));
    try {
      const result = await this.docker.runAction(root, project.directory, action, services);
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

  private startLogPolling(project: ComposeProject): void {
    this.stopLogPolling();
    this.logRefreshTimer = window.setInterval(() => void this.pollLogs(project), 3000);
  }
  private stopLogPolling(): void {
    if (this.logRefreshTimer !== null) window.clearInterval(this.logRefreshTimer);
    this.logRefreshTimer = null;
    this.logRequestActive = false;
  }
  private async pollLogs(project: ComposeProject): Promise<void> {
    const root = this.rootDirectory();
    if (!root || this.logRequestActive || this.logsDirectory() !== project.directory) return;
    this.logRequestActive = true;
    try { const content = await this.docker.getLogs(root, project.directory); this.logs.set(content || "Aucun log disponible pour ce projet."); }
    catch (error) { this.logs.set(this.errorMessage(error)); }
    finally { this.logRequestActive = false; }
  }
  applicationUrl(project: ComposeProject): string | null {
    if (this.selectedDirectory() !== project.directory) return null;
    for (const container of this.containers()) {
      for (const port of container.ports) {
        const url = this.portUrl(port);
        if (url) return url;
      }
    }
    return null;
  }

  async openApplication(project: ComposeProject): Promise<void> {
    const url = this.applicationUrl(project);
    if (!url) { this.setNotice("info", "Aucun port HTTP publié détecté pour cette application."); return; }
    try { await this.docker.openExternalUrl(url); }
    catch (error) { this.setNotice("error", this.errorMessage(error)); }
  }

  portUrl(port: string): string | null {
    const match = port.match(/^(?:[^:]+:)?(\d+):(\d+)(?:\/(tcp|udp))?$/i);
    return match && (!match[3] || match[3].toLowerCase() === "tcp") ? "http://localhost:" + match[1] : null;
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
