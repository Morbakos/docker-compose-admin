import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

export interface ComposeProject {
  name: string;
  directory: string;
  relativeDirectory: string;
  composeFiles: string[];
  status: string;
}

export type ComposeAction = "start" | "stop" | "restart" | "pull";

@Injectable({ providedIn: "root" })
export class DockerService {
  chooseDirectory(): Promise<string | null> {
    return invoke<string | null>("pick_compose_directory");
  }

  scanDirectory(rootDirectory: string): Promise<ComposeProject[]> {
    return invoke<ComposeProject[]>("scan_compose_directory", { rootDirectory });
  }

  runAction(rootDirectory: string, projectDirectory: string, action: ComposeAction): Promise<string> {
    return invoke<string>("run_compose_action", { rootDirectory, projectDirectory, action });
  }

  getLogs(rootDirectory: string, projectDirectory: string): Promise<string> {
    return invoke<string>("get_compose_logs", { rootDirectory, projectDirectory });
  }
}
