//! The language files: `languages/<code>/*.yaml` beside the exe (in a development build, the repo's `locales` folder). They are read
//! as text and parsed by the interface (src/i18n), so a language can be added or its text changed without building the app.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// The folder of the languages: `languages` beside the exe, else (a development build) the repo's `locales`.
fn languages_dir() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("languages");
    if beside.is_dir() {
        return Some(beside);
    }
    #[cfg(debug_assertions)]
    {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../locales");
        if repo.is_dir() {
            return repo.canonicalize().ok();
        }
    }
    None
}

/// A language's folder, for a code that names one folder (nothing that would reach outside the languages folder).
fn language_dir(code: &str) -> Result<PathBuf, String> {
    if code.is_empty() || !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("not a language code: {code}"));
    }
    let dir = languages_dir().ok_or("no languages folder")?.join(code);
    if dir.is_dir() { Ok(dir) } else { Err(format!("no language folder {}", dir.display())) }
}

fn yaml_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("yaml"))).collect())
        .unwrap_or_default();
    files.sort();
    files
}

#[derive(Serialize)]
pub struct LanguageFile {
    /// The file's name without `.yaml`: the area of its messages (`meta` is the language's name and locale).
    pub name: String,
    pub text: String,
}

/// Where the languages are (empty when there is no folder: the built-in English is used).
#[tauri::command]
pub fn languages_folder() -> String {
    languages_dir().map(|d| d.display().to_string()).unwrap_or_default()
}

/// The languages there are: the folders of the languages folder with a `meta.yaml`.
#[tauri::command]
pub fn list_languages() -> Vec<String> {
    let Some(dir) = languages_dir() else { return Vec::new() };
    let mut codes: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().filter(|e| e.path().join("meta.yaml").is_file()).filter_map(|e| e.file_name().into_string().ok()).collect())
        .unwrap_or_default();
    codes.sort();
    codes
}

/// A language's files, as text.
#[tauri::command]
pub fn read_language(code: String) -> Result<Vec<LanguageFile>, String> {
    let dir = language_dir(&code)?;
    yaml_files(&dir)
        .into_iter()
        .map(|p| {
            let text = std::fs::read_to_string(&p).map_err(|e| format!("{}: {e}", p.display()))?;
            let name = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            Ok(LanguageFile { name, text: text.trim_start_matches('\u{feff}').to_owned() })
        })
        .collect()
}

/// A stamp of a language's files (their names, sizes and times): it changes when one is saved, added or removed.
#[tauri::command]
pub fn language_stamp(code: String) -> Result<String, String> {
    let dir = language_dir(&code)?;
    let mut stamp = String::new();
    for p in yaml_files(&dir) {
        let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
        let time = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis());
        stamp.push_str(&format!("{}:{}:{};", p.file_name().unwrap_or_default().to_string_lossy(), meta.len(), time));
    }
    Ok(stamp)
}

#[cfg(test)]
mod tests {
    use super::language_dir;

    #[test]
    fn a_code_cannot_reach_outside_the_languages_folder() {
        for bad in ["", "..", "../x", "en/../..", "C:\\x", "a b"] {
            assert!(language_dir(bad).is_err(), "{bad}");
        }
    }
}
