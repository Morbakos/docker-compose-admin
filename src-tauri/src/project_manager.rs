use crate::compose::{compose_services, compose_watch_services, scan_directory, ComposeProject};
use rusqlite::{params, Connection};
use std::{collections::BTreeMap, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir()
        .map_err(|error| format!("Dossier de données indisponible : {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Impossible de préparer les données locales : {error}"))?;
    Ok(directory.join("compose-admin.sqlite3"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?)
        .map_err(|error| format!("Ouverture de la base locale impossible : {error}"))?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS projects (
            directory TEXT PRIMARY KEY NOT NULL,
            root_directory TEXT NOT NULL,
            project_json TEXT NOT NULL,
            selected_services_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );"
    ).map_err(|error| format!("Initialisation de la base locale impossible : {error}"))?;
    Ok(connection)
}

fn validate_compose_file_selection(available: &[String], selected: &[String]) -> Result<(), String> {
    if selected.is_empty() {
        return Err("Sélectionnez au moins un fichier Compose.".to_string());
    }
    let available: std::collections::BTreeSet<&str> = available.iter().map(String::as_str).collect();
    let mut unique = std::collections::BTreeSet::new();
    if selected.iter().any(|file| !available.contains(file.as_str()) || !unique.insert(file.as_str())) {
        return Err("La sélection contient un fichier Compose inconnu ou en double.".to_string());
    }
    Ok(())
}

fn retain_available_services(available: &[String], selected: Vec<String>) -> Vec<String> {
    let available: std::collections::BTreeSet<&str> = available.iter().map(String::as_str).collect();
    let mut unique = std::collections::BTreeSet::new();
    selected.into_iter()
        .filter(|service| available.contains(service.as_str()) && unique.insert(service.clone()))
        .collect()
}

fn store_project(connection: &Connection, project: &ComposeProject) -> Result<(), String> {
    let project_json = serde_json::to_string(project)
        .map_err(|error| format!("Sérialisation du projet impossible : {error}"))?;
    let selected_services = serde_json::to_string(&project.selected_services)
        .map_err(|error| format!("Sérialisation des services impossible : {error}"))?;
    connection.execute(
        "INSERT INTO projects (directory, root_directory, project_json, selected_services_json)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(directory) DO UPDATE SET
           root_directory = excluded.root_directory,
           project_json = excluded.project_json",
        params![project.directory, project.root_directory, project_json, selected_services],
    ).map_err(|error| format!("Enregistrement du projet impossible : {error}"))?;
    Ok(())
}

fn list_projects(app: &AppHandle) -> Result<Vec<ComposeProject>, String> {
    let connection = open_database(app)?;
    let mut statement = connection.prepare(
        "SELECT directory, root_directory, project_json, selected_services_json
         FROM projects ORDER BY created_at, directory"
    ).map_err(|error| format!("Lecture des projets impossible : {error}"))?;

    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    }).map_err(|error| format!("Lecture des projets impossible : {error}"))?;

    let mut stored = Vec::new();
    for row in rows {
        stored.push(row.map_err(|error| format!("Lecture d'un projet impossible : {error}"))?);
    }
    drop(statement);

    let mut scans: BTreeMap<String, Result<Vec<ComposeProject>, String>> = BTreeMap::new();
    let mut result = Vec::new();
    for (directory, root_directory, project_json, selected_json) in stored {
        let selected_services: Vec<String> = serde_json::from_str(&selected_json).unwrap_or_default();
        let cached: ComposeProject = serde_json::from_str(&project_json)
            .map_err(|error| format!("Métadonnées du projet invalides : {error}"))?;

        if !scans.contains_key(&root_directory) {
            scans.insert(root_directory.clone(), scan_directory(&root_directory));
        }

        let cached_compose_files = cached.compose_files.clone();
        let mut project = match scans.get(&root_directory).and_then(|scan| scan.as_ref().ok())
            .and_then(|projects| projects.iter().find(|project| project.directory == directory))
        {
            Some(current) => current.clone(),
            None => {
                let mut unavailable = cached;
                unavailable.status = "unavailable".to_string();
                unavailable.accessible = false;
                unavailable
            }
        };

        project.root_directory = root_directory;
        let available_files: std::collections::BTreeSet<String> = project.available_compose_files.iter().cloned().collect();
        let selection_is_valid = !cached_compose_files.is_empty()
            && cached_compose_files.iter().all(|file| available_files.contains(file));
        if selection_is_valid {
            project.compose_files = cached_compose_files;
            project.services = compose_services(&project).unwrap_or_default();
            project.watch_services = compose_watch_services(&project).unwrap_or_default();
        } else {
            // Never silently replace a user's saved Compose selection with
            // another configuration when one of its files has disappeared.
            project.accessible = false;
            project.status = "configuration_changed".to_string();
        }
        project.selected_services = retain_available_services(&project.services, selected_services);
        if project.accessible {
            store_project(&connection, &project)?;
        }
        result.push(project);
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub async fn list_registered_projects(app: AppHandle) -> Result<Vec<ComposeProject>, String> {
    tauri::async_runtime::spawn_blocking(move || list_projects(&app))
        .await
        .map_err(|error| format!("Chargement des projets impossible : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn add_registered_projects(app: AppHandle, directory: String) -> Result<Vec<ComposeProject>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(&directory).canonicalize()
            .map_err(|error| format!("Dossier inaccessible : {error}"))?;
        if !root.is_dir() {
            return Err("Le chemin sélectionné n'est pas un dossier.".to_string());
        }
        let root = root.to_string_lossy().to_string();
        let mut discovered = scan_directory(&root)?;
        if discovered.is_empty() {
            return Err("Aucun fichier Docker Compose reconnu dans ce dossier.".to_string());
        }
        if discovered.len() > 1 {
            return Err("Plusieurs projets Compose ont été détectés. Sélectionnez le dossier d'un seul projet pour l'ajouter individuellement.".to_string());
        }
        let connection = open_database(&app)?;
        for project in &mut discovered {
            project.root_directory = root.clone();
            project.selected_services = project.services.clone();
            project.accessible = true;
            store_project(&connection, project)?;
        }
        drop(connection);
        list_projects(&app)
    }).await.map_err(|error| format!("Ajout du projet impossible : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn remove_registered_project(app: AppHandle, directory: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&app)?;
        connection.execute("DELETE FROM projects WHERE directory = ?1", params![directory])
            .map_err(|error| format!("Retrait du projet impossible : {error}"))?;
        Ok(())
    }).await.map_err(|error| format!("Retrait du projet impossible : {error}"))?
}


pub(crate) fn resolve_registered_project(
    app: &AppHandle,
    root_directory: &str,
    project_directory: &str,
) -> Result<ComposeProject, String> {
    let connection = open_database(app)?;
    let (stored_root, project_json, selected_services_json): (String, String, String) = connection.query_row(
        "SELECT root_directory, project_json, selected_services_json FROM projects WHERE directory = ?1",
        params![project_directory],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Projet non enregistré dans Compose Admin.".to_string())?;
    if stored_root != root_directory {
        return Err("Le dossier racine ne correspond pas au projet enregistré.".to_string());
    }
    let cached: ComposeProject = serde_json::from_str(&project_json)
        .map_err(|error| format!("Métadonnées du projet invalides : {error}"))?;
    let current = scan_directory(root_directory)?.into_iter()
        .find(|project| project.directory == project_directory)
        .ok_or_else(|| "Ce projet ne contient plus de fichier Docker Compose reconnu.".to_string())?;
    let available: std::collections::BTreeSet<String> = current.available_compose_files.iter().cloned().collect();
    if cached.compose_files.is_empty() || cached.compose_files.iter().any(|file| !available.contains(file)) {
        return Err("La sélection des fichiers Compose est invalide. Modifiez-la puis réessayez.".to_string());
    }
    let mut project = current;
    project.compose_files = cached.compose_files;
    project.services = compose_services(&project)?;
    project.watch_services = compose_watch_services(&project)?;
    let selected_services: Vec<String> = serde_json::from_str(&selected_services_json).unwrap_or_default();
    project.selected_services = retain_available_services(&project.services, selected_services);
    Ok(project)
}

#[tauri::command]
#[specta::specta]
pub async fn save_project_compose_files(
    app: AppHandle,
    directory: String,
    files: Vec<String>,
) -> Result<ComposeProject, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&app)?;
        let (json, selected_json): (String, String) = connection.query_row(
            "SELECT project_json, selected_services_json FROM projects WHERE directory = ?1",
            params![directory],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "Projet enregistré introuvable.".to_string())?;
        let mut project: ComposeProject = serde_json::from_str(&json)
            .map_err(|error| format!("Métadonnées du projet invalides : {error}"))?;
        project.selected_services = serde_json::from_str(&selected_json).unwrap_or_default();
        validate_compose_file_selection(&project.available_compose_files, &files)?;
        project.compose_files = files;
        project.services = compose_services(&project)?;
        project.watch_services = compose_watch_services(&project)?;
        project.selected_services.retain(|service| project.services.contains(service));
        store_project(&connection, &project)?;
        Ok(project)
    }).await.map_err(|error| format!("Sauvegarde des fichiers Compose impossible : {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn save_project_services(app: AppHandle, directory: String, services: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&app)?;
        let json: String = connection.query_row(
            "SELECT project_json FROM projects WHERE directory = ?1",
            params![directory],
            |row| row.get(0),
        ).map_err(|error| format!("Projet enregistré introuvable : {error}"))?;
        let project: ComposeProject = serde_json::from_str(&json)
            .map_err(|error| format!("Métadonnées du projet invalides : {error}"))?;
        if services.iter().any(|service| !project.services.contains(service)) {
            return Err("La sélection contient un service inconnu pour ce projet.".to_string());
        }
        let services = retain_available_services(&project.services, services);
        let selected = serde_json::to_string(&services)
            .map_err(|error| format!("Sérialisation des services impossible : {error}"))?;
        connection.execute(
            "UPDATE projects SET selected_services_json = ?1 WHERE directory = ?2",
            params![selected, directory],
        ).map_err(|error| format!("Sauvegarde des préférences impossible : {error}"))?;
        Ok(())
    }).await.map_err(|error| format!("Sauvegarde des préférences impossible : {error}"))?
}


#[cfg(test)]
mod tests {
    use super::{retain_available_services, store_project, validate_compose_file_selection};
    use crate::compose::ComposeProject;
    use rusqlite::Connection;

    fn test_project(directory: &str) -> ComposeProject {
        ComposeProject {
            name: "Example".to_string(),
            directory: directory.to_string(),
            relative_directory: ".".to_string(),
            compose_files: vec![format!("{directory}/compose.yaml")],
            available_compose_files: vec![format!("{directory}/compose.yaml")],
            watch_services: Vec::new(),
            services: vec!["api".to_string(), "worker".to_string()],
            status: "stopped".to_string(),
            root_directory: directory.to_string(),
            selected_services: vec!["api".to_string()],
            accessible: true,
        }
    }

    fn create_schema(connection: &Connection) {
        connection.execute_batch(
            "CREATE TABLE projects (
                directory TEXT PRIMARY KEY NOT NULL,
                root_directory TEXT NOT NULL,
                project_json TEXT NOT NULL,
                selected_services_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        ).unwrap();
    }

    #[test]

    #[test]
    fn validates_compose_file_selection_and_preserves_order() {
        let available = vec!["compose.yaml".to_string(), "compose.dev.yaml".to_string()];
        let selected = vec!["compose.dev.yaml".to_string(), "compose.yaml".to_string()];
        assert!(validate_compose_file_selection(&available, &selected).is_ok());
        assert!(validate_compose_file_selection(&available, &[]).is_err());
        assert!(validate_compose_file_selection(&available, &["missing.yaml".to_string()]).is_err());
        assert!(validate_compose_file_selection(
            &available,
            &["compose.yaml".to_string(), "compose.yaml".to_string()],
        ).is_err());
    }

    #[test]
    fn saved_service_selection_filters_unknown_values_and_removes_duplicates() {
        let available = vec!["api".to_string(), "worker".to_string()];
        let selected = vec![
            "worker".to_string(), "unknown".to_string(),
            "api".to_string(), "worker".to_string(),
        ];
        assert_eq!(
            retain_available_services(&available, selected),
            vec!["worker".to_string(), "api".to_string()],
        );
    }

    #[test]
    fn empty_service_selection_is_preserved() {
        let available = vec!["api".to_string()];
        assert!(retain_available_services(&available, Vec::new()).is_empty());
    }

        fn refreshing_project_metadata_preserves_saved_service_selection() {
        let connection = Connection::open_in_memory().unwrap();
        create_schema(&connection);
        let mut project = test_project("/tmp/example");
        store_project(&connection, &project).unwrap();

        connection.execute(
            "UPDATE projects SET selected_services_json = '[\"worker\"]' WHERE directory = ?1",
            ["/tmp/example"],
        ).unwrap();

        project.name = "Updated name".to_string();
        store_project(&connection, &project).unwrap();

        let selected: String = connection.query_row(
            "SELECT selected_services_json FROM projects WHERE directory = ?1",
            ["/tmp/example"],
            |row| row.get(0),
        ).unwrap();
        let metadata: String = connection.query_row(
            "SELECT project_json FROM projects WHERE directory = ?1",
            ["/tmp/example"],
            |row| row.get(0),
        ).unwrap();
        let refreshed: ComposeProject = serde_json::from_str(&metadata).unwrap();

        assert_eq!(selected, "[\"worker\"]");
        assert_eq!(refreshed.name, "Updated name");
    }

    #[test]
    fn removing_a_registration_does_not_require_touching_project_files() {
        let connection = Connection::open_in_memory().unwrap();
        create_schema(&connection);
        let directory = std::env::temp_dir().join(format!("compose-admin-persistence-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let compose_file = directory.join("compose.yaml");
        std::fs::write(&compose_file, "services: {}").unwrap();

        let project = test_project(directory.to_string_lossy().as_ref());
        store_project(&connection, &project).unwrap();
        connection.execute("DELETE FROM projects WHERE directory = ?1", [project.directory]).unwrap();

        assert!(compose_file.exists());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
