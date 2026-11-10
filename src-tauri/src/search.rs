use crate::list_children;
use serde::Serialize;
use std::{fs, io::Read, path::Path};

const RESULT_LIMIT: usize = 100;
const TEXT_LIMIT: u64 = 8 * 1024 * 1024;
const PREVIEW_LENGTH: usize = 180;

/// Identifies a matching document and, for text matches, a one-based source line.
#[derive(Serialize)]
struct Match {
    path: String,
    line: Option<usize>,
    preview: String,
}

/// Gives the UI the results and explains whether the scan was incomplete.
#[derive(Serialize, Default)]
pub(super) struct SearchResults {
    matches: Vec<Match>,
    limited: bool,
    skipped: usize,
}

fn preview(line: &str, lower: &str, offset: usize) -> String {
    let start = lower[..offset].chars().count().saturating_sub(45);
    let mut chars = line.chars().skip(start);
    let text: String = chars.by_ref().take(PREVIEW_LENGTH).collect();
    format!("{}{text}{}", if start > 0 { "…" } else { "" }, if chars.next().is_some() { "…" } else { "" })
}

/// Searches only Markdown descendants of the open root, without following directory links.
pub(super) fn run(root: &Path, query: &str, contents: bool) -> SearchResults {
    let needle = query.trim().to_lowercase();
    let mut output = SearchResults::default();
    if needle.is_empty() {
        return output;
    }
    let mut folders = vec![root.to_owned()];
    while let Some(folder) = folders.pop() {
        let Ok(folder) = folder.canonicalize() else {
            output.skipped += 1;
            continue;
        };
        if !folder.starts_with(root) {
            continue;
        }
        let Ok(entries) = list_children(root, &folder, "") else {
            output.skipped += 1;
            continue;
        };
        let mut children = Vec::new();
        for entry in entries {
            if entry.directory {
                if !entry.name.starts_with('.') && entry.name != "node_modules" {
                    children.push(root.join(entry.path));
                }
                continue;
            }
            if !contents {
                if entry.path.to_lowercase().contains(&needle) {
                    output.matches.push(Match { path: entry.path, line: None, preview: String::new() });
                }
            } else {
                let Ok(path) = root.join(&entry.path).canonicalize() else {
                    output.skipped += 1;
                    continue;
                };
                if !path.starts_with(root) {
                    continue;
                }
                let mut text = String::new();
                if fs::File::open(path).and_then(|file| file.take(TEXT_LIMIT + 1).read_to_string(&mut text)).is_err()
                    || text.len() as u64 > TEXT_LIMIT
                {
                    output.skipped += 1;
                    continue;
                }
                for (index, line) in text.lines().enumerate() {
                    let lower = line.to_lowercase();
                    if let Some(offset) = lower.find(&needle) {
                        output.matches.push(Match { path: entry.path.clone(), line: Some(index + 1), preview: preview(line, &lower, offset) });
                    }
                    if output.matches.len() >= RESULT_LIMIT {
                        break;
                    }
                }
            }
            if output.matches.len() >= RESULT_LIMIT {
                output.limited = true;
                return output;
            }
        }
        folders.extend(children.into_iter().rev());
    }
    output
}
