use crate::{has_extension, tree_path, MARKDOWN_EXTENSIONS};
use grep_matcher::Matcher as _;
use grep_regex::RegexMatcherBuilder;
use grep_searcher::{SearcherBuilder, Sink, SinkMatch};
use ignore::WalkBuilder;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use nucleo_matcher::{
    pattern::{AtomKind, CaseMatching, Normalization, Pattern},
    Config, Matcher, Utf32Str,
};
use serde::Serialize;
use std::{
    fs,
    io::{self, Read},
    path::{Component, Path, PathBuf, Prefix},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const RESULT_LIMIT: usize = 100;
const TEXT_LIMIT: u64 = 8 * 1024 * 1024;
const PREVIEW_LENGTH: usize = 180;
const BATCH_SIZE: usize = 16;
const BATCH_INTERVAL: Duration = Duration::from_millis(50);
const UNWATCHED_CACHE_LIFETIME: Duration = Duration::from_secs(5);

/// Identifies a document and, for content results, its one-based source line.
#[derive(Serialize)]
pub(super) struct Match {
    path: String,
    line: Option<usize>,
    preview: String,
}

/// Streams new matches, followed by a final batch describing scan completeness.
#[derive(Serialize, Default)]
pub(super) struct SearchResults {
    matches: Vec<Match>,
    limited: bool,
    skipped: usize,
    done: bool,
}

/// Keeps paths only; document contents always come from the current files.
struct PathCache {
    root: PathBuf,
    paths: Arc<Vec<String>>,
    skipped: usize,
    watcher: Option<RecommendedWatcher>,
    refreshed: Instant,
}

/// Owns cancellation and the active folder's lazily built filename index.
#[derive(Default)]
pub(super) struct Service {
    active: Mutex<Option<(u64, Arc<AtomicBool>)>>,
    cache: Mutex<Option<PathCache>>,
    dirty: Arc<AtomicBool>,
}

impl Service {
    /// Monotonic frontend IDs prevent delayed IPC from replacing a newer request.
    pub(super) fn start(&self, id: u64) -> Arc<AtomicBool> {
        let cancel = Arc::new(AtomicBool::new(false));
        let mut active = self.active.lock().unwrap();
        if active
            .as_ref()
            .is_some_and(|(previous_id, _)| *previous_id >= id)
        {
            cancel.store(true, Ordering::Relaxed);
            return cancel;
        }
        if let Some((_, previous)) = active.replace((id, cancel.clone())) {
            previous.store(true, Ordering::Relaxed);
        }
        cancel
    }

    /// Remember cancellation even when it arrives before the search invocation.
    pub(super) fn cancel(&self, id: u64) {
        let mut active = self.active.lock().unwrap();
        if active
            .as_ref()
            .is_none_or(|(active_id, _)| *active_id <= id)
        {
            if let Some((_, previous)) = active.replace((id, Arc::new(AtomicBool::new(true)))) {
                previous.store(true, Ordering::Relaxed);
            }
        }
    }

    /// Refresh on dialog open as UNC/WSL shares may not deliver native watch events.
    pub(super) fn invalidate(&self) {
        self.dirty.store(true, Ordering::Relaxed);
    }

    fn paths(&self, root: &Path, cancel: &AtomicBool) -> (Arc<Vec<String>>, usize) {
        let mut cache = self.cache.lock().unwrap();
        if cancel.load(Ordering::Relaxed) {
            return (Arc::new(Vec::new()), 0);
        }
        if cache.as_ref().is_none_or(|c| c.root != root) {
            self.invalidate();
            let changed = self.dirty.clone();
            let watcher =
                notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                    // Reads do not invalidate the index; errors require a fresh scan too.
                    if event.as_ref().map_or(true, |event| {
                        !matches!(event.kind, notify::EventKind::Access(_))
                    }) {
                        changed.store(true, Ordering::Relaxed);
                    }
                })
                .ok()
                .and_then(|mut watcher| {
                    watcher.watch(root, RecursiveMode::Recursive).ok()?;
                    Some(watcher)
                });
            *cache = Some(PathCache {
                root: root.to_owned(),
                paths: Arc::new(Vec::new()),
                skipped: 0,
                watcher,
                refreshed: Instant::now(),
            });
        }
        let cache = cache.as_mut().unwrap();
        // Native notifications on UNC/WSL are not reliable; bound their cache lifetime.
        let network = matches!(root.components().next(), Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..)));
        if self.dirty.swap(false, Ordering::Relaxed)
            || ((network || cache.watcher.is_none())
                && cache.refreshed.elapsed() >= UNWATCHED_CACHE_LIFETIME)
        {
            let mut paths = Vec::new();
            let mut skipped = 0;
            for entry in walk(root) {
                if cancel.load(Ordering::Relaxed) {
                    self.invalidate();
                    return (Arc::new(Vec::new()), 0);
                }
                match entry {
                    Ok(entry)
                        if entry.file_type().is_some_and(|kind| kind.is_file())
                            && has_extension(entry.path(), MARKDOWN_EXTENSIONS) =>
                    {
                        if let Some(path) = tree_path(entry.path(), root) {
                            paths.push(path);
                        }
                    }
                    Err(_) => skipped += 1,
                    _ => {}
                }
            }
            cache.paths = Arc::new(paths);
            cache.skipped = skipped;
            cache.refreshed = Instant::now();
            if skipped > 0 {
                self.invalidate();
            }
        }
        (cache.paths.clone(), cache.skipped)
    }
}

fn walk(root: &Path) -> ignore::Walk {
    WalkBuilder::new(root)
        .standard_filters(false)
        .follow_links(false)
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_some_and(|kind| kind.is_dir())
                || (!entry.file_name().to_string_lossy().starts_with('.')
                    && entry.file_name() != "node_modules")
        })
        .build()
}

fn preview(line: &str, offset: usize) -> String {
    let start = line[..offset].chars().count().saturating_sub(45);
    let mut chars = line.chars().skip(start);
    let text: String = chars.by_ref().take(PREVIEW_LENGTH).collect();
    format!(
        "{}{text}{}",
        if start > 0 { "…" } else { "" },
        if chars.next().is_some() { "…" } else { "" }
    )
}

/// Checks cancellation between buffered reads, including files without any matches.
struct CancellableReader<'a> {
    file: fs::File,
    cancel: &'a AtomicBool,
}

impl Read for CancellableReader<'_> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        if self.cancel.load(Ordering::Relaxed) {
            return Ok(0);
        }
        self.file.read(bytes)
    }
}

/// Converts source lines into bounded previews without allocating lowercase copies.
struct ContentSink<'a, F> {
    path: &'a str,
    matcher: &'a grep_regex::RegexMatcher,
    cancel: &'a AtomicBool,
    output: &'a mut SearchResults,
    total: &'a mut usize,
    last_batch: &'a mut Instant,
    send: &'a mut F,
}

impl<F: FnMut(SearchResults) -> bool> Sink for ContentSink<'_, F> {
    type Error = io::Error;

    fn matched(&mut self, _: &grep_searcher::Searcher, found: &SinkMatch<'_>) -> io::Result<bool> {
        if self.cancel.load(Ordering::Relaxed) {
            return Ok(false);
        }
        let line = std::str::from_utf8(found.bytes())
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let offset = self
            .matcher
            .find(line.as_bytes())?
            .map_or(0, |matched| matched.start());
        self.output.matches.push(Match {
            path: self.path.into(),
            line: found.line_number().map(|line| line as usize),
            preview: preview(line.trim_end_matches(['\r', '\n']), offset),
        });
        *self.total += 1;
        self.output.limited = *self.total >= RESULT_LIMIT;
        // Show the first hit immediately, then amortize IPC for subsequent hits.
        if *self.total == 1
            || self.output.matches.len() >= BATCH_SIZE
            || self.last_batch.elapsed() >= BATCH_INTERVAL
        {
            if !(self.send)(std::mem::take(self.output)) {
                self.cancel.store(true, Ordering::Relaxed);
            }
            *self.last_batch = Instant::now();
        }
        Ok(*self.total < RESULT_LIMIT && !self.cancel.load(Ordering::Relaxed))
    }
}

/// Searches Markdown only. Returns errors for invalid patterns; streams read failures as skipped counts.
pub(super) fn run(
    service: &Service,
    root: &Path,
    query: &str,
    contents: bool,
    cancel: &AtomicBool,
    mut send: impl FnMut(SearchResults) -> bool,
) -> Result<(), String> {
    let mut output = SearchResults::default();
    let query = query.trim();
    if query.is_empty() {
        output.done = true;
        send(output);
        return Ok(());
    }
    if !contents {
        let (paths, skipped) = service.paths(root, cancel);
        let pattern = Pattern::new(
            query,
            CaseMatching::Ignore,
            Normalization::Smart,
            AtomKind::Fuzzy,
        );
        let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
        let mut buffer = Vec::new();
        let mut scored = Vec::new();
        for path in paths.iter() {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            if let Some(score) = pattern.score(Utf32Str::new(path, &mut buffer), &mut matcher) {
                scored.push((score, path));
            }
        }
        scored.sort_unstable_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        output.limited = scored.len() > RESULT_LIMIT;
        output.skipped = skipped;
        output.matches = scored
            .into_iter()
            .take(RESULT_LIMIT)
            .map(|(_, path)| Match {
                path: path.clone(),
                line: None,
                preview: String::new(),
            })
            .collect();
    } else {
        let matcher = RegexMatcherBuilder::new()
            .case_insensitive(true)
            .fixed_strings(true)
            .build(query)
            .map_err(|error| error.to_string())?;
        let mut searcher = SearcherBuilder::new()
            .line_number(true)
            .bom_sniffing(false)
            .build();
        let mut total = 0;
        let mut last_batch = Instant::now();
        for entry in walk(root) {
            if cancel.load(Ordering::Relaxed) {
                return Ok(());
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    output.skipped += 1;
                    continue;
                }
            };
            if !entry.file_type().is_some_and(|kind| kind.is_file())
                || !has_extension(entry.path(), MARKDOWN_EXTENSIONS)
            {
                continue;
            }
            // Preserve the authorized root boundary for Windows junctions as well as symlinks.
            let path = match entry.path().canonicalize() {
                Ok(path) if path.starts_with(root) => path,
                Ok(_) => continue,
                Err(_) => {
                    output.skipped += 1;
                    continue;
                }
            };
            let result = (|| -> io::Result<()> {
                let file = fs::File::open(path)?;
                if file.metadata()?.len() > TEXT_LIMIT {
                    return Err(io::Error::other("file too large"));
                }
                let path = tree_path(entry.path(), root).unwrap();
                searcher.search_reader(
                    &matcher,
                    CancellableReader { file, cancel }.take(TEXT_LIMIT + 1),
                    ContentSink {
                        path: &path,
                        matcher: &matcher,
                        cancel,
                        output: &mut output,
                        total: &mut total,
                        last_batch: &mut last_batch,
                        send: &mut send,
                    },
                )
            })();
            if result.is_err() {
                output.skipped += 1;
            }
            if !output.matches.is_empty() && last_batch.elapsed() >= BATCH_INTERVAL {
                if !send(std::mem::take(&mut output)) {
                    return Ok(());
                }
                last_batch = Instant::now();
            }
            if total >= RESULT_LIMIT {
                output.limited = true;
                break;
            }
        }
    }
    if !cancel.load(Ordering::Relaxed) {
        output.done = true;
        send(output);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Removes only the unique fixture directory created by the test.
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
            let root = std::env::temp_dir().join(format!(
                "moye-search-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&root).unwrap();
            Self(root.canonicalize().unwrap())
        }
        fn write(&self, path: &str, text: &str) {
            let path = self.0.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, text).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    fn collect(service: &Service, root: &Path, query: &str, contents: bool) -> Vec<SearchResults> {
        let mut batches = Vec::new();
        run(
            service,
            root,
            query,
            contents,
            &AtomicBool::new(false),
            |batch| {
                batches.push(batch);
                true
            },
        )
        .unwrap();
        assert!(batches.last().unwrap().done);
        batches
    }

    #[test]
    fn literal_unicode_lines_and_scope_are_preserved() {
        let fixture = Fixture::new();
        fixture.write("notes/中文.MD", "标题\r\n中文 Foo.bar\r\nfooXbar\r\n");
        fixture.write(".hidden/no.md", "Foo.bar");
        fixture.write("node_modules/no.md", "Foo.bar");
        fixture.write("image.txt", "Foo.bar");
        fixture.write(".gitignore", "notes/\n");
        let batches = collect(&Service::default(), &fixture.0, "foo.bar", true);
        let matches: Vec<_> = batches.iter().flat_map(|batch| &batch.matches).collect();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].path, "notes/中文.MD");
        assert_eq!(matches[0].line, Some(2));
        assert_eq!(matches[0].preview, "中文 Foo.bar");
        let batches = collect(&Service::default(), &fixture.0, "中文", true);
        assert_eq!(
            batches
                .iter()
                .map(|batch| batch.matches.len())
                .sum::<usize>(),
            1
        );
    }

    #[test]
    fn streams_caps_and_cancels_without_final_stale_batch() {
        let fixture = Fixture::new();
        fixture.write("many.md", &"hit\n".repeat(150));
        let service = Service::default();
        let batches = collect(&service, &fixture.0, "hit", true);
        assert_eq!(batches[0].matches.len(), 1);
        assert!(!batches[0].done);
        assert_eq!(
            batches
                .iter()
                .map(|batch| batch.matches.len())
                .sum::<usize>(),
            RESULT_LIMIT
        );
        assert!(batches.last().unwrap().limited);
        let cancel = AtomicBool::new(false);
        let mut calls = 0;
        run(&service, &fixture.0, "hit", true, &cancel, |_| {
            calls += 1;
            cancel.store(true, Ordering::Relaxed);
            true
        })
        .unwrap();
        assert_eq!(calls, 1);
        // Cancelling before a queued invocation starts must also cancel that invocation.
        service.cancel(4);
        assert!(service.start(4).load(Ordering::Relaxed));
        let current = service.start(5);
        service.cancel(4);
        assert!(!current.load(Ordering::Relaxed));
        service.start(6);
        assert!(current.load(Ordering::Relaxed));
    }

    #[test]
    fn fuzzy_paths_refresh_after_file_changes() {
        let fixture = Fixture::new();
        fixture.write("docs/search-engine.md", "text");
        let service = Service::default();
        let batches = collect(&service, &fixture.0, "srcheng", false);
        assert_eq!(batches[0].matches[0].path, "docs/search-engine.md");
        fs::remove_file(fixture.0.join("docs/search-engine.md")).unwrap();
        fixture.write("new/search-engine.markdown", "text");
        service.invalidate();
        let batches = collect(&service, &fixture.0, "srcheng", false);
        assert_eq!(batches[0].matches.len(), 1);
        assert_eq!(batches[0].matches[0].path, "new/search-engine.markdown");
    }

    #[test]
    fn skips_oversize_and_does_not_follow_links() {
        let fixture = Fixture::new();
        let huge = fs::File::create(fixture.0.join("huge.md")).unwrap();
        huge.set_len(TEXT_LIMIT + 1).unwrap();
        #[cfg(unix)]
        let _outside = {
            let outside = Fixture::new();
            outside.write("outside.md", "hit");
            std::os::unix::fs::symlink(&outside.0, fixture.0.join("link")).unwrap();
            outside
        };
        let batches = collect(&Service::default(), &fixture.0, "hit", true);
        assert_eq!(
            batches
                .iter()
                .map(|batch| batch.matches.len())
                .sum::<usize>(),
            0
        );
        assert_eq!(batches.iter().map(|batch| batch.skipped).sum::<usize>(), 1);
    }
}
