// Generated from the Rust command definitions with Tauri Specta.
import { invoke } from "@tauri-apps/api/core";

export type ComposeProject = {
  name: string;
  directory: string;
  relativeDirectory: string;
  composeFiles: string[];
  status: string;
};
export type ComposeContainer = {
  id: string; name: string; service: string; state: string; status: string;
  ports: string[]; cpu: string | null; memory: string | null;
};
export type DockerEngineStatus = {
  connected: boolean; version: string | null; error: string | null;
};
export const commands = {
  getDockerEngineStatus: () => invoke<DockerEngineStatus>("get_docker_engine_status"),
  pickComposeDirectory: () => invoke<string | null>("pick_compose_directory"),
  scanComposeDirectory: (rootDirectory: string) =>
    invoke<ComposeProject[]>("scan_compose_directory", { rootDirectory }),
  getComposeContainers: (rootDirectory: string, projectDirectory: string) =>
    invoke<ComposeContainer[]>("get_compose_containers", { rootDirectory, projectDirectory }),
  runComposeServiceAction: (rootDirectory: string, projectDirectory: string, service: string, action: string) =>
    invoke<string>("run_compose_service_action", { rootDirectory, projectDirectory, service, action }),
  runComposeAction: (rootDirectory: string, projectDirectory: string, action: string) =>
    invoke<string>("run_compose_action", { rootDirectory, projectDirectory, action }),
  getComposeLogs: (rootDirectory: string, projectDirectory: string) =>
    invoke<string>("get_compose_logs", { rootDirectory, projectDirectory }),
};
