use std::process::Command;

fn main() {
    tauri_build::build();

    println!("cargo:rerun-if-env-changed=GIT_COMMIT");

    let commit = std::env::var("GIT_COMMIT")
        .ok()
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short=7", "HEAD"])
                .output()
                .ok()
                .filter(|output| output.status.success())
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "dev".to_string());

    println!("cargo:rustc-env=GIT_COMMIT={commit}");
}
