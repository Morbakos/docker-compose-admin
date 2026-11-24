use crate::compose::{scan_directory, ComposeProject};
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

    let mut scans: BTreeMap<String, Result<Vec<ComposeProject>, String>> = BTreeMap::new();
    let mut result = Vec::new();
    for (directory, root_directory, project_json, selected_json) in stored {
        let selected_services: Vec<String> = serde_json::from_str(&selected_json).unwrap_or_default();
        let cached: ComposeProject = serde_json::from_str(&project_json)
            .map_err(|error| format!("Métadonnées du projet invalides : {error}"))?;

        if !scans.contains_key(&root_directory) {
            scans.insert(root_directory.clone(), scan_directory(&root_directory));
        }

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
        project.selected_services = selected_services.into_iter()
            .filter(|service| project.services.contains(service))
            .collect();
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
        let connection = open_database(&app)?;
        for project in &mut discovered {
            project.root_directory = root.clone();
            project.selected_services = project.services.clone();
            project.accessible = true;
            store_project(&connection, project)?;
        }
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
        let selected = serde_json::to_string(&services)
            .map_err(|error| format!("Sérialisation des services impossible : {error}"))?;
        connection.execute(
            "UPDATE projects SET selected_services_json = ?1 WHERE directory = ?2",
            params![selected, directory],
        ).map_err(|error| format!("Sauvegarde des préférences impossible : {error}"))?;
        Ok(())
    }).await.map_err(|error| format!("Sauvegarde des préférences impossible : {error}"))?
}
