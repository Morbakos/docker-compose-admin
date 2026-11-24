use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Output, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

static WATCH_PROCESSES: OnceLock<Mutex<BTreeMap<String, Child>>> = OnceLock::new();
static LOG_PROCESSES: OnceLock<Mutex<BTreeMap<String, Child>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ComposeOutput {
    project_directory: String,
    stream: String,
    source: String,
    line: String,
    timestamp: u128,
}

fn watch_processes() -> &'static Mutex<BTreeMap<String, Child>> {
    WATCH_PROCESSES.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn log_processes() -> &'static Mutex<BTreeMap<String, Child>> {
    LOG_PROCESSES.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn stop_log_process(directory: &str) {
    if let Ok(mut processes) = log_processes().lock() {
        if let Some(mut child) = processes.remove(directory) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn stop_watch_process(directory: &str) {
    if let Ok(mut processes) = watch_processes().lock() {
        if let Some(mut child) = processes.remove(directory) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn validate_selected_services(
    project: &ComposeProject,
    selected_services: &[String],
    required: bool,
) -> Result<Vec<String>, String> {
    if selected_services.is_empty() {
        return if required {
            Err("Sélectionnez au moins un service.".to_string())
        } else {
            Ok(Vec::new())
        };
    }

    let available: BTreeSet<&str> = project.services.iter().map(String::as_str).collect();
    if selected_services
        .iter()
        .any(|service| !available.contains(service.as_str()))
    {
        return Err("La sélection contient un service inconnu pour ce projet.".to_string());
    }

    let mut unique = BTreeSet::new();
    Ok(selected_services
        .iter()
        .filter(|service| unique.insert(service.as_str()))
        .cloned()
        .collect())
}

fn start_watch_process(
    project: &ComposeProject,
    selected_services: &[String],
    app: tauri::AppHandle,
) -> Result<String, String> {
    stop_watch_process(&project.directory);
    let mut args = compose_base_args(project);
    args.extend([
        "up".to_string(),
        "--build".to_string(),
        "--watch".to_string(),
    ]);
    args.extend(selected_services.iter().cloned());
    let mut child = Command::new("docker")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
		.env("BUILDKIT_PROGRESS", "plain")
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "Docker CLI introuvable. Installez Docker Desktop ou Docker Engine et vérifiez que « docker » est disponible dans le PATH.".to_string()
            } else {
                format!("Impossible de démarrer Docker Compose Watch : {error}")
            }
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let project_directory = project.directory.clone();

	// Lecture de stdout et stderr
	// Et "forward" de ces logs vers le front
    if let Some(stdout) = stdout {
        forward_compose_output(stdout, app.clone(), project_directory.clone(), "watch", "stdout");
    }
    
	if let Some(stderr) = stderr {
        forward_compose_output(stderr, app.clone(), project_directory.clone(), "watch", "stderr");
    }

    watch_processes()
        .lock()
        .map_err(|_| "Gestionnaire de surveillance indisponible.".to_string())?
        .insert(project.directory.clone(), child);
    Ok("Environnement démarré avec la synchronisation automatique du code.".to_string())
}

fn forward_compose_output<R: std::io::Read + Send + 'static>(
    reader: R,
    app: tauri::AppHandle,
    project_directory: String,
    source: &'static str,
    stream: &'static str,
) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            let Ok(line) = line else {
                break;
            };

            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();

            let output = ComposeOutput {
                project_directory: project_directory.clone(),
                stream: stream.to_string(),
                source: source.to_string(),
                line,
                timestamp,
            };

            if let Err(error) = app.emit("compose-output", output) {
                eprintln!("Failed to emit compose output event: {error}");
                break;
            }
        }
    });
}

const MAX_SCAN_DEPTH: usize = 16;
const MAX_COMPOSE_FILES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ComposeProject {
    pub name: String,
    pub directory: String,
    pub relative_directory: String,
    pub compose_files: Vec<String>,
    pub available_compose_files: Vec<String>,
    pub services: Vec<String>,
    pub watch_services: Vec<String>,
    pub status: String,
    pub root_directory: String,
    pub selected_services: Vec<String>,
    pub accessible: bool,
}

fn is_compose_file_name(file_name: &str) -> bool {
    let name = file_name.to_ascii_lowercase();
    let yaml_extension = name.ends_with(".yml") || name.ends_with(".yaml");

    if !yaml_extension {
        return false;
    }

    let stem = name
        .strip_suffix(".yaml")
        .or_else(|| name.strip_suffix(".yml"))
        .unwrap_or(&name);

    stem == "compose"
        || stem == "docker-compose"
        || stem.starts_with("compose.")
        || stem.starts_with("docker-compose.")
}

fn is_ignored_directory(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".hg"
            | ".svn"
            | "node_modules"
            | "target"
            | "dist"
            | "vendor"
            | ".venv"
            | "venv"
            | ".idea"
            | ".angular"
    )
}

fn collect_compose_files(
    directory: &Path,
    depth: usize,
    files: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if depth > MAX_SCAN_DEPTH || files.len() >= MAX_COMPOSE_FILES {
        return Ok(());
    }

    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Impossible de lire « {} » : {error}", directory.display()))?;

    for entry in entries.flatten() {
        if files.len() >= MAX_COMPOSE_FILES {
            break;
        }

        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let name = entry.file_name();
            if name.to_str().is_some_and(is_ignored_directory) {
                continue;
            }
            collect_compose_files(&path, depth + 1, files)?;
        } else if file_type.is_file()
            && entry.file_name().to_str().is_some_and(is_compose_file_name)
        {
            files.push(path);
        }
    }

    Ok(())
}

fn compose_file_order(path: &Path) -> (u8, String) {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let priority = match name.as_str() {
        "compose.yaml" => 0,
        "compose.yml" => 1,
        "docker-compose.yaml" => 2,
        "docker-compose.yml" => 3,
        _ if name.contains(".override.") => 5,
        _ => 4,
    };

    (priority, name)
}

fn sort_compose_files(files: &mut [PathBuf]) {
    files.sort_by_key(|file| compose_file_order(file));
}

fn declared_project_name(files: &[PathBuf]) -> Option<String> {
    let first_file = files.first()?;
    let contents = fs::read_to_string(first_file).ok()?;

    for line in contents.lines() {
        if line.starts_with("name:") {
            let value = line
                .trim_start_matches("name:")
                .split('#')
                .next()
                .unwrap_or_default()
                .trim()
                .trim_matches('"')
                .trim_matches('\'');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }

    None
}

fn compose_base_args(project: &ComposeProject) -> Vec<String> {
    let mut args = vec!["compose".to_string()];

    // Resolve .env from the selected repository root, not from the
    // desktop app's working directory or a nested Compose file directory.
    let relative_depth = if project.relative_directory == "." {
        0
    } else {
        Path::new(&project.relative_directory).components().count()
    };
    let project_root = Path::new(&project.directory)
        .ancestors()
        .nth(relative_depth)
        .unwrap_or_else(|| Path::new(&project.directory));
    let env_file = project_root.join(".env");
    if env_file.is_file() {
        args.push("--env-file".to_string());
        args.push(env_file.to_string_lossy().to_string());
    }

    args.extend([
        "--project-directory".to_string(),
        project.directory.clone(),
    ]);

    for file in &project.compose_files {
        args.push("--file".to_string());
        args.push(file.clone());
    }

    args
}

fn run_docker(args: &[String]) -> Result<Output, String> {
    let output = Command::new("docker")
        .args(args)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "Docker CLI introuvable. Installez Docker Desktop ou Docker Engine et vérifiez que « docker » est disponible dans le PATH.".to_string()
            } else {
                format!("Impossible de lancer Docker : {error}")
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let details = if stderr.is_empty() { stdout } else { stderr };

        return Err(if details.is_empty() {
            format!(
                "Docker a quitté avec le code {}.",
                output.status.code().unwrap_or(-1)
            )
        } else {
            details
        });
    }

    Ok(output)
}

fn output_text(output: Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => "Commande exécutée.".to_string(),
    }
}

pub(crate) fn compose_services(project: &ComposeProject) -> Result<Vec<String>, String> {
    let mut args = compose_base_args(project);
    args.extend(["config".to_string(), "--services".to_string()]);
    let output = run_docker(&args)?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut services: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect();
    services.sort();
    services.dedup();
    Ok(services)
}

pub(crate) fn compose_watch_services(project: &ComposeProject) -> Result<Vec<String>, String> {
    let mut args = compose_base_args(project);
    args.extend(["config".to_string(), "--format".to_string(), "json".to_string()]);
    let output = run_docker(&args)?;
    let config: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Configuration Compose JSON invalide : {error}"))?;
    let mut watched = Vec::new();
    if let Some(services) = config.get("services").and_then(Value::as_object) {
        for (name, service) in services {
            let has_watch = service.get("develop")
                .and_then(|develop| develop.get("watch"))
                .and_then(Value::as_array)
                .is_some_and(|rules| !rules.is_empty());
            if has_watch {
                watched.push(name.clone());
            }
        }
    }
    watched.sort();
    Ok(watched)
}

fn project_status(project: &ComposeProject) -> String {
    let mut args = compose_base_args(project);
    args.extend([
        "ps".to_string(),
        "--all".to_string(),
        "--format".to_string(),
        "json".to_string(),
    ]);

    let output = match run_docker(&args) {
        Ok(output) => output,
        Err(_) => return "unknown".to_string(),
    };

    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return "stopped".to_string();
    }

    let mut states = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(&text) {
        if let Some(rows) = value.as_array() {
            for row in rows {
                if let Some(state) = row
                    .get("State")
                    .or_else(|| row.get("Status"))
                    .and_then(Value::as_str)
                {
                    states.push(state.to_ascii_lowercase());
                }
            }
        } else if let Some(state) = value
            .get("State")
            .or_else(|| value.get("Status"))
            .and_then(Value::as_str)
        {
            states.push(state.to_ascii_lowercase());
        }
    } else {
        for line in text.lines() {
            if let Ok(row) = serde_json::from_str::<Value>(line) {
                if let Some(state) = row
                    .get("State")
                    .or_else(|| row.get("Status"))
                    .and_then(Value::as_str)
                {
                    states.push(state.to_ascii_lowercase());
                }
            }
        }
    }

    if states.is_empty() {
        "unknown".to_string()
    } else if states
        .iter()
        .any(|state| state == "running" || state.starts_with("up "))
    {
        "running".to_string()
    } else {
        "stopped".to_string()
    }
}

pub fn scan_directory(root_directory: &str) -> Result<Vec<ComposeProject>, String> {
    let root = PathBuf::from(root_directory)
        .canonicalize()
        .map_err(|error| format!("Dossier inaccessible : {error}"))?;

    if !root.is_dir() {
        return Err("Le chemin sélectionné n'est pas un dossier.".to_string());
    }

    let mut compose_files = Vec::new();
    collect_compose_files(&root, 0, &mut compose_files)?;
    let mut by_directory: BTreeMap<PathBuf, Vec<PathBuf>> = BTreeMap::new();

    for file in compose_files {
        if let Some(parent) = file.parent() {
            by_directory
                .entry(parent.to_path_buf())
                .or_default()
                .push(file);
        }
    }

    let mut projects = Vec::new();

    for (directory, files) in by_directory {
        let mut files = files;
        sort_compose_files(&mut files);
        let directory_name = directory
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("compose-project");
        let name = declared_project_name(&files).unwrap_or_else(|| directory_name.to_string());

        let relative_directory = directory
            .strip_prefix(&root)
            .map(|path| {
                if path.as_os_str().is_empty() {
                    ".".to_string()
                } else {
                    path.to_string_lossy().to_string()
                }
            })
            .unwrap_or_else(|_| ".".to_string());

        let mut project = ComposeProject {
            name,
            directory: directory.to_string_lossy().to_string(),
            relative_directory,
            compose_files: files.iter().map(|file| file.to_string_lossy().to_string()).collect(),
            available_compose_files: files.iter().map(|file| file.to_string_lossy().to_string()).collect(),
            services: Vec::new(),
            status: "unknown".to_string(),
            root_directory: root.to_string_lossy().to_string(),
            selected_services: Vec::new(),
            watch_services: Vec::new(),
            accessible: true,
        };

        project.services = compose_services(&project).unwrap_or_default();
        project.watch_services = compose_watch_services(&project).unwrap_or_default();
        project.selected_services = project.services.clone();
        project.status = project_status(&project);
        projects.push(project);
    }

    projects.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(projects)
}

fn resolve_project(
    app: &tauri::AppHandle,
    root_directory: &str,
    project_directory: &str,
) -> Result<ComposeProject, String> {
    let root = PathBuf::from(root_directory)
        .canonicalize()
        .map_err(|error| format!("Dossier racine inaccessible : {error}"))?;
    let selected = PathBuf::from(project_directory)
        .canonicalize()
        .map_err(|error| format!("Projet introuvable : {error}"))?;

    if !selected.starts_with(&root) || !selected.is_dir() {
        return Err("Le projet sélectionné est en dehors du dossier autorisé.".to_string());
    }

    crate::project_manager::resolve_registered_project(
        app,
        root.to_string_lossy().as_ref(),
        selected.to_string_lossy().as_ref(),
    )
}

#[tauri::command]
#[specta::specta]
pub async fn pick_compose_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;

        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map(|path| path.to_string_lossy().to_string())
                    .map_err(|error| format!("Chemin sélectionné invalide : {error}"))
            })
            .transpose()
    })
    .await
    .map_err(|error| format!("Le sélecteur de dossier a échoué : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn scan_compose_directory(root_directory: String) -> Result<Vec<ComposeProject>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_directory(&root_directory))
        .await
        .map_err(|error| format!("L'analyse du dossier a échoué : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn run_compose_action(
    app: tauri::AppHandle,
    root_directory: String,
    project_directory: String,
    action: String,
    services: Vec<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = resolve_project(&app, &root_directory, &project_directory)?;
        let selected_services = validate_selected_services(
            &project,
            &services,
            action == "start" || action == "restart" || action == "build",
        )?;
        match action.as_str() {
            "start" | "restart" => start_watch_process(&project, &selected_services, app),
            "stop" => {
                stop_watch_process(&project.directory);
                let mut args = compose_base_args(&project);
                args.push("stop".to_string());
                args.extend(selected_services);
                run_docker(&args).map(output_text)
            }
            "pull" => {
                let mut args = compose_base_args(&project);
                args.push("pull".to_string());
                args.extend(selected_services);
                run_docker(&args).map(output_text)
            }
            "build" => {
                let mut args = compose_base_args(&project);
                args.push("build".to_string());
                args.extend(selected_services);
                run_docker(&args).map(output_text)
            }
            _ => Err("Action non autorisée.".to_string()),
        }
    })
    .await
    .map_err(|error| format!("L'action Docker a échoué : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn start_compose_logs(
    app: tauri::AppHandle,
    root_directory: String,
    project_directory: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let project = resolve_project(&app, &root_directory, &project_directory)?;
        stop_log_process(&project.directory);

        let mut args = compose_base_args(&project);
        args.extend([
            "logs".to_string(),
            "--follow".to_string(),
            "--tail".to_string(),
            "250".to_string(),
            "--no-color".to_string(),
            "--timestamps".to_string(),
        ]);

        let mut child = Command::new("docker")
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    "Docker CLI introuvable. Vérifiez que Docker est installé et accessible depuis le PATH."
                        .to_string()
                } else {
                    format!("Impossible de démarrer le flux des logs : {error}")
                }
            })?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let directory = project.directory.clone();

        if let Some(stdout) = stdout {
            forward_compose_output(
                stdout,
                app.clone(),
                directory.clone(),
                "container",
                "stdout",
            );
        }
        if let Some(stderr) = stderr {
            forward_compose_output(
                stderr,
                app.clone(),
                directory.clone(),
                "container",
                "stderr",
            );
        }

        log_processes()
            .lock()
            .map_err(|_| "Gestionnaire des flux de logs indisponible.".to_string())?
            .insert(directory, child);

        Ok(())
    })
    .await
    .map_err(|error| format!("Démarrage du flux des logs impossible : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn stop_compose_logs(project_directory: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if project_directory.trim().is_empty() {
            return Err("Répertoire de projet invalide.".to_string());
        }

        stop_log_process(&project_directory);
        Ok(())
    })
    .await
    .map_err(|error| format!("Arrêt du flux des logs impossible : {error}"))?
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ComposeContainer {
    pub id: String,
    pub name: String,
    pub service: String,
    pub state: String,
    pub status: String,
    pub ports: Vec<String>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
}

fn parse_port_list(row: &Value) -> Vec<String> {
    let Some(publishers) = row.get("Publishers").or_else(|| row.get("Ports")) else {
        return Vec::new();
    };
    if let Some(text) = publishers.as_str() {
        return text
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
    }
    publishers
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let host = item
                        .get("PublishedPort")
                        .and_then(Value::as_u64)
                        .map(|p| p.to_string());
                    let target = item
                        .get("TargetPort")
                        .and_then(Value::as_u64)
                        .map(|p| p.to_string());
                    let protocol = item
                        .get("Protocol")
                        .and_then(Value::as_str)
                        .unwrap_or("tcp");
                    match (host, target) {
                        (Some(h), Some(t)) => Some(format!("{h}:{t}/{protocol}")),
                        (None, Some(t)) => Some(format!("{t}/{protocol}")),
                        _ => None,
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn container_stats() -> BTreeMap<String, (String, String)> {
    let output = Command::new("docker")
        .args(["stats", "--no-stream", "--format", "{{json .}}"])
        .output();
    let Ok(output) = output else {
        return BTreeMap::new();
    };
    if !output.status.success() {
        return BTreeMap::new();
    }
    let mut stats = BTreeMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Ok(row) = serde_json::from_str::<Value>(line) {
            let name = row.get("Name").and_then(Value::as_str).unwrap_or_default();
            let cpu = row.get("CPUPerc").and_then(Value::as_str).unwrap_or("--");
            let mem = row.get("MemUsage").and_then(Value::as_str).unwrap_or("--");
            if !name.is_empty() {
                stats.insert(name.to_string(), (cpu.to_string(), mem.to_string()));
            }
        }
    }
    stats
}

fn container_list(
    app: &tauri::AppHandle,
    root_directory: &str,
    project_directory: &str,
) -> Result<Vec<ComposeContainer>, String> {
    let project = resolve_project(app, root_directory, project_directory)?;
    let mut args = compose_base_args(&project);
    args.extend(
        ["ps", "--all", "--format", "json"]
            .iter()
            .map(|s| s.to_string()),
    );
    let output = run_docker(&args)?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(&stdout) {
        if let Some(array) = value.as_array() {
            rows.extend(array.iter().cloned());
        } else {
            rows.push(value);
        }
    } else {
        for line in stdout.lines() {
            if let Ok(row) = serde_json::from_str::<Value>(line) {
                rows.push(row);
            }
        }
    }
    let stats = container_stats();
    Ok(rows
        .into_iter()
        .map(|row| {
            let id = row
                .get("ID")
                .or_else(|| row.get("Id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let name = row
                .get("Name")
                .or_else(|| row.get("Names"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim_start_matches('/')
                .to_string();
            let service = row
                .get("Service")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let state = row
                .get("State")
                .or_else(|| row.get("Status"))
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_lowercase();
            let status = row
                .get("Status")
                .and_then(Value::as_str)
                .unwrap_or(&state)
                .to_string();
            let (cpu, memory) = stats.get(&name).cloned().unwrap_or_default();
            ComposeContainer {
                id,
                name,
                service,
                state,
                status,
                ports: parse_port_list(&row),
                cpu: if cpu.is_empty() { None } else { Some(cpu) },
                memory: if memory.is_empty() {
                    None
                } else {
                    Some(memory)
                },
            }
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub async fn get_compose_containers(
    app: tauri::AppHandle,
    root_directory: String,
    project_directory: String,
) -> Result<Vec<ComposeContainer>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        container_list(&app, &root_directory, &project_directory)
    })
    .await
    .map_err(|e| format!("Récupération des containers impossible : {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn run_compose_service_action(
    app: tauri::AppHandle,
    root_directory: String,
    project_directory: String,
    service: String,
    action: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if service.is_empty()
            || !service
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        {
            return Err("Nom de service invalide.".to_string());
        }
        let project = resolve_project(&app, &root_directory, &project_directory)?;
        let verb = match action.as_str() {
            "start" => "start",
            "stop" => "stop",
            "restart" => "restart",
            _ => return Err("Action de service non autorisée.".to_string()),
        };
        let mut args = compose_base_args(&project);
        args.extend([verb.to_string(), service]);
        run_docker(&args).map(output_text)
    })
    .await
    .map_err(|e| format!("Action service échouée : {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{is_compose_file_name, is_ignored_directory};

    #[test]
    fn recognizes_supported_compose_yaml_names() {
        for file in [
            "compose.yaml",
            "compose.yml",
            "docker-compose.yaml",
            "docker-compose.yml",
            "compose.override.yaml",
            "docker-compose.prod.yml",
        ] {
            assert!(is_compose_file_name(file), "{file} should be recognized");
        }
    }

    #[test]
    fn ignores_non_compose_and_non_yaml_files() {
        for file in [
            "config.yaml",
            "compose.yaml.example",
            "docker-compose.json",
            "compose.txt",
            "my-compose.yaml",
        ] {
            assert!(!is_compose_file_name(file), "{file} should be ignored");
        }
    }

    #[test]
    fn skips_generated_and_dependency_directories() {
        assert!(is_ignored_directory("node_modules"));
        assert!(is_ignored_directory(".git"));
        assert!(is_ignored_directory("target"));
        assert!(!is_ignored_directory("my-app"));
    }
}
