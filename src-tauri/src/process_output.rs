use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Read},
    thread::{self, JoinHandle},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessOutput {
    project_directory: String,
    stream: String,
    source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    operation: Option<String>,
    line: String,
    timestamp: u128,
}

/// Forwards a child process stream to the shared Tauri event channel.
/// Returns the captured lines so the caller can report useful failure details.
pub(crate) fn forward_process_output<R: Read + Send + 'static>(
    reader: R,
    app: tauri::AppHandle,
    project_directory: String,
    source: &'static str,
    operation: Option<String>,
    stream: &'static str,
) -> JoinHandle<Vec<String>> {
    thread::spawn(move || {
        let mut captured = Vec::new();
        for line in BufReader::new(reader).lines() {
            let Ok(line) = line else { break };
            captured.push(line.clone());
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();
            let output = ProcessOutput {
                project_directory: project_directory.clone(),
                stream: stream.to_string(),
                source: source.to_string(),
                operation: operation.clone(),
                line,
                timestamp,
            };
            if let Err(error) = app.emit("compose-output", output) {
                eprintln!("Failed to emit process output event: {error}");
                break;
            }
        }
        captured
    })
}

#[cfg(test)]
mod tests {
    use super::ProcessOutput;

    #[test]
    fn serializes_operation_context_for_action_logs() {
        let output = ProcessOutput {
            project_directory: "/workspace/app".into(),
            stream: "stderr".into(),
            source: "action".into(),
            operation: Some("build".into()),
            line: "step failed".into(),
            timestamp: 42,
        };
        let value = serde_json::to_value(output).expect("event should serialize");
        assert_eq!(value["projectDirectory"], "/workspace/app");
        assert_eq!(value["source"], "action");
        assert_eq!(value["operation"], "build");
        assert_eq!(value["stream"], "stderr");
        assert_eq!(value["line"], "step failed");
    }

    #[test]
    fn omits_operation_for_existing_watch_and_container_events() {
        let output = ProcessOutput {
            project_directory: "/workspace/app".into(),
            stream: "stdout".into(),
            source: "watch".into(),
            operation: None,
            line: "watch ready".into(),
            timestamp: 43,
        };
        let value = serde_json::to_value(output).expect("event should serialize");
        assert!(value.get("operation").is_none());
        assert_eq!(value["source"], "watch");
    }
}
