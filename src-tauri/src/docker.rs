use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DockerEngineStatus {
    pub connected: bool,
    pub version: Option<String>,
    pub error: Option<String>,
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
            let message = if stderr.is_empty() {
                "Docker Engine ne répond pas.".to_string()
            } else {
                stderr
            };
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
    use super::DockerEngineStatus;

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
