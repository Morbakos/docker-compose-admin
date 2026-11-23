import { Injectable } from "@angular/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands, type ComposeContainer, type ComposeProject, type DockerEngineStatus } from "./bindings";

export type { ComposeContainer, ComposeProject, DockerEngineStatus };
export interface DockerEngineStatusWithChecking extends DockerEngineStatus {
  checking?: boolean;
}
export type ComposeAction = "start" | "stop" | "restart" | "pull";

@Injectable({ providedIn: "root" })
export class DockerService {
  getEngineStatus(): Promise<DockerEngineStatusWithChecking> {
    return commands.getDockerEngineStatus();
  }
  chooseDirectory(): Promise<string | null> {
    return commands.pickComposeDirectory();
  }
  scanDirectory(rootDirectory: string): Promise<ComposeProject[]> {
    return commands.scanComposeDirectory(rootDirectory);
  }
  getContainers(rootDirectory: string, projectDirectory: string): Promise<ComposeContainer[]> {
    return commands.getComposeContainers(rootDirectory, projectDirectory);
  }
  runServiceAction(rootDirectory: string, projectDirectory: string, service: string, action: "start" | "stop" | "restart"): Promise<string> {
    return commands.runComposeServiceAction(rootDirectory, projectDirectory, service, action);
  }
  runAction(rootDirectory: string, projectDirectory: string, action: ComposeAction): Promise<string> {
    return commands.runComposeAction(rootDirectory, projectDirectory, action);
  }
  openExternalUrl(url: string): Promise<void> {
    return openUrl(url);
  }
  getLogs(rootDirectory: string, projectDirectory: string): Promise<string> {
    return commands.getComposeLogs(rootDirectory, projectDirectory);
  }
}
