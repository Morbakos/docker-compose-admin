use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DockerEngineStatus {
    pub connected: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

fn engine_unavailable_message(stderr: &str) -> String {
    let normalized = stderr.to_ascii_lowercase();
    let daemon_not_running = [
        "cannot connect to the docker daemon",
        "is the docker daemon running",
        "failed to connect to the docker api",
        "error during connect",
        "docker_engine",
        "dockerdesktoplinuxengine",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern));

    if daemon_not_running {
        "Docker n'est pas démarré. Lancez Docker Desktop, puis réessayez.".to_string()
    } else if stderr.trim().is_empty() {
        "Docker Engine ne répond pas.".to_string()
    } else {
        stderr.trim().to_string()
    }
}

fn check_engine() -> DockerEngineStatus {
    let output = Command::new("docker")
        .args(["info", "--format", "{{.ServerVersion}}"])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if version.is_empty() {
                DockerEngineStatus {
                    connected: true,
                    version: None,
                    error: None,
                }
            } else {
                DockerEngineStatus {
                    connected: true,
                    version: Some(version),
                    error: None,
                }
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = engine_unavailable_message(&stderr);
            DockerEngineStatus {
                connected: false,
                version: None,
                error: Some(message),
            }
        }
        Err(error) => {
            let message = if error.kind() == std::io::ErrorKind::NotFound {
                "Docker CLI introuvable. Vérifiez que Docker Desktop ou Docker Engine est installé et accessible depuis le PATH.".to_string()
            } else {
                format!("Impossible de lancer Docker : {error}")
            };
            DockerEngineStatus {
                connected: false,
                version: None,
                error: Some(message),
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_docker_engine_status() -> DockerEngineStatus {
    tauri::async_runtime::spawn_blocking(check_engine)
        .await
        .unwrap_or_else(|error| DockerEngineStatus {
            connected: false,
            version: None,
            error: Some(format!("Vérification Docker échouée : {error}")),
        })
}

#[cfg(test)]
mod tests {
    use super::{engine_unavailable_message, DockerEngineStatus};

    #[test]
    fn daemon_connection_errors_ask_user_to_start_docker_desktop() {
        let message = engine_unavailable_message(
            "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
        );
        assert_eq!(
            message,
            "Docker n'est pas démarré. Lancez Docker Desktop, puis réessayez."
        );
    }

    #[test]
    fn unrelated_docker_errors_keep_the_original_details() {
        let message = engine_unavailable_message("permission denied while connecting");
        assert_eq!(message, "permission denied while connecting");
    }

    #[test]
    fn engine_status_serializes_with_frontend_casing() {
        let status = DockerEngineStatus {
            connected: true,
            version: Some("29.0.0".to_string()),
            error: None,
        };
        let value = serde_json::to_value(status).expect("serializable status");
        assert_eq!(value["connected"], true);
        assert_eq!(value["version"], "29.0.0");
        assert!(value["error"].is_null());
    }
}
