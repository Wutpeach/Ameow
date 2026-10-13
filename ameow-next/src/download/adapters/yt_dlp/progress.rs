//! Optional bounded transfer facts. Never a process/file settlement authority.
use serde_json::Value;

pub const DOWNLOAD_TEMPLATE: &str = r#"download:AMEOW_PROGRESS={"status":%(progress.status)j,"format_id":%(info.format_id)j,"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j}"#;
pub const PP_TEMPLATE: &str = r#"postprocess:AMEOW_PP={"postprocessor":%(progress.postprocessor)j,"status":%(progress.status)j}"#;
use crate::download::progress::TransferProgress;
const MAX_LINE: usize = 2048;
const MAX_BYTES: u64 = 1 << 53;
#[derive(Default)]
struct Framer {
    sequence: u64,
    line: Vec<u8>,
    discard: bool,
}
impl Framer {
    fn push(&mut self, sequence: u64, text: &str) -> Vec<Vec<u8>> {
        // Native readers use 8192-byte chunks; lossy UTF-8 can expand each byte to three.
        if text.len() > 24_576 {
            self.sequence = sequence;
            self.line.clear();
            self.discard = true;
            return Vec::new();
        }
        if sequence != self.sequence.saturating_add(1) {
            self.line.clear();
            self.discard = true;
        }
        self.sequence = sequence;
        let mut lines = Vec::new();
        for byte in text.bytes() {
            if byte == b'\n' {
                if !self.discard {
                    if self.line.last() == Some(&b'\r') {
                        self.line.pop();
                    }
                    lines.push(std::mem::take(&mut self.line));
                }
                self.line.clear();
                self.discard = false;
            } else if !self.discard {
                if self.line.len() < MAX_LINE {
                    self.line.push(byte);
                } else {
                    self.line.clear();
                    self.discard = true;
                }
            }
        }
        lines
    }
}
struct Stream {
    id: String,
    bytes: u64,
    total: Option<u64>,
    fragmented: bool,
    seen: bool,
}
pub struct ProgressFeed {
    frames: [Framer; 2],
    streams: Vec<Stream>,
    latest: Option<TransferProgress>,
    last_publish: Option<u64>,
    postprocessing: bool,
}
fn scalar_bytes(value: &Value) -> Option<u64> {
    value.as_u64().filter(|n| *n <= MAX_BYTES)
}
impl ProgressFeed {
    pub fn selected(metadata: &Value) -> Self {
        let mut streams = Vec::new();
        for selected in super::selection::chosen(metadata).into_iter().take(3) {
            if let Some(id) = selected["format_id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 128)
            {
                let protocol = selected["protocol"].as_str().unwrap_or("");
                let fragmented =
                    selected.get("fragments").is_some() || !matches!(protocol, "http" | "https");
                streams.push(Stream {
                    id: id.into(),
                    bytes: 0,
                    total: if fragmented {
                        None
                    } else {
                        scalar_bytes(&selected["filesize"]).filter(|n| *n > 0)
                    },
                    fragmented,
                    seen: false,
                });
            }
        }
        if streams.len() > 2
            || streams
                .iter()
                .enumerate()
                .any(|(i, s)| streams.iter().take(i).any(|other| other.id == s.id))
        {
            streams.clear();
        }
        Self {
            frames: Default::default(),
            streams,
            latest: None,
            last_publish: None,
            postprocessing: false,
        }
    }
    #[cfg(test)]
    pub fn new(metadata: &Value, selector: &str) -> Self {
        let ids: Vec<_> = selector.split('+').take(3).collect();
        let mut streams: Vec<_> = ids
            .iter()
            .filter_map(|id| {
                let selected = metadata["formats"]
                    .as_array()?
                    .iter()
                    .find(|f| f["format_id"].as_str() == Some(*id))?;
                let protocol = selected["protocol"].as_str().unwrap_or("");
                let fragmented =
                    selected.get("fragments").is_some() || !matches!(protocol, "http" | "https");
                Some(Stream {
                    id: (*id).into(),
                    bytes: 0,
                    total: if fragmented {
                        None
                    } else {
                        scalar_bytes(&selected["filesize"]).filter(|n| *n > 0)
                    },
                    fragmented,
                    seen: false,
                })
            })
            .collect();
        if ids.len() > 2
            || streams.len() != ids.len()
            || ids.iter().any(|id| id.is_empty())
            || (ids.len() == 2 && ids[0] == ids[1])
        {
            streams.clear();
        }
        Self {
            frames: Default::default(),
            streams,
            latest: None,
            last_publish: None,
            postprocessing: false,
        }
    }
    pub fn push(
        &mut self,
        stderr: bool,
        sequence: u64,
        text: &str,
        now: u64,
    ) -> Option<TransferProgress> {
        let lines = self.frames[usize::from(stderr)].push(sequence, text);
        let mut changed = false;
        let mut urgent = false;
        for line in lines {
            if let Some(raw) = line.strip_prefix(b"AMEOW_PP=") {
                let Ok(value) = serde_json::from_slice::<Value>(raw) else {
                    continue;
                };
                if value.as_object().is_none_or(|object| {
                    object.len() != 2
                        || object
                            .keys()
                            .any(|key| !matches!(key.as_str(), "postprocessor" | "status"))
                }) || value["postprocessor"] != "Merger"
                {
                    continue;
                }
                if !matches!(value["status"].as_str(), Some("started" | "finished")) {
                    continue;
                }
                self.postprocessing = true;
                self.latest = Some(TransferProgress {
                    downloaded_bytes: 0,
                    exact_total_bytes: None,
                    bytes_per_second: None,
                    fraction: None,
                    observed_at_ms: now,
                    merging: value["status"] == "started",
                });
                changed = true;
                urgent = true;
            } else if let Some(raw) = line.strip_prefix(b"AMEOW_PROGRESS=") {
                if self.postprocessing {
                    continue;
                }
                let Ok(value) = serde_json::from_slice::<Value>(raw) else {
                    continue;
                };
                if value.as_object().is_none_or(|object| {
                    object.len() != 6
                        || object.keys().any(|key| {
                            !matches!(
                                key.as_str(),
                                "status"
                                    | "format_id"
                                    | "downloaded_bytes"
                                    | "total_bytes"
                                    | "total_bytes_estimate"
                                    | "speed"
                            )
                        })
                }) {
                    continue;
                }
                let Some(status @ ("downloading" | "finished")) = value["status"].as_str() else {
                    continue;
                };
                let Some(bytes) = scalar_bytes(&value["downloaded_bytes"]) else {
                    continue;
                };
                if !value["total_bytes_estimate"].is_null()
                    && scalar_bytes(&value["total_bytes_estimate"]).is_none()
                {
                    continue;
                }
                let Some(id) = value["format_id"].as_str() else {
                    continue;
                };
                let Some(stream) = self.streams.iter_mut().find(|stream| stream.id == id) else {
                    continue;
                };
                let speed = if value["speed"].is_null() {
                    None
                } else {
                    let Some(speed) = value["speed"]
                        .as_f64()
                        .filter(|speed| speed.is_finite() && *speed >= 0.)
                    else {
                        continue;
                    };
                    Some(speed)
                };
                let total = if value["total_bytes"].is_null() {
                    None
                } else {
                    let Some(total) =
                        scalar_bytes(&value["total_bytes"]).filter(|total| *total > 0)
                    else {
                        continue;
                    };
                    Some(total)
                };
                if bytes < stream.bytes || total.is_some_and(|total| bytes > total) {
                    continue;
                }
                stream.bytes = bytes;
                stream.seen = true;
                if !stream.fragmented && status == "downloading" {
                    if stream.total.is_some() && total.is_some() && stream.total != total {
                        stream.fragmented = true;
                        stream.total = None;
                    } else if total.is_some() {
                        stream.total = total;
                    }
                }
                let downloaded_bytes = self.streams.iter().map(|s| s.bytes).sum();
                let exact_total_bytes = if self.streams.is_empty()
                    || self
                        .streams
                        .iter()
                        .any(|s| !s.seen || s.fragmented || s.total.is_none())
                {
                    None
                } else {
                    Some(self.streams.iter().filter_map(|s| s.total).sum())
                };
                let fraction = exact_total_bytes
                    .filter(|total| *total > 0 && downloaded_bytes <= *total)
                    .map(|total| (downloaded_bytes as f64 / total as f64) as f32);
                self.latest = Some(TransferProgress {
                    downloaded_bytes,
                    exact_total_bytes,
                    bytes_per_second: if status == "downloading" { speed } else { None },
                    fraction,
                    observed_at_ms: now,
                    merging: false,
                });
                changed = true;
                urgent |= status == "finished";
            }
        }
        if changed
            && (urgent
                || self
                    .last_publish
                    .is_none_or(|last| now.saturating_sub(last) >= 200))
        {
            self.last_publish = Some(now);
            self.latest.clone()
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn feed(fragmented: bool) -> ProgressFeed {
        ProgressFeed::new(
            &json!({"formats":[{"format_id":"v","protocol": if fragmented {"m3u8_native"} else {"https"}}]}),
            "v",
        )
    }
    fn record(status: &str, id: &str, bytes: u64, total: Value, speed: Value) -> String {
        format!(
            "AMEOW_PROGRESS={}\n",
            json!({"status":status,"format_id":id,"downloaded_bytes":bytes,"total_bytes":total,"total_bytes_estimate":900,"speed":speed})
        )
    }
    #[test]
    fn progress_bounds_recover_after_oversize_and_invalid_numeric_records() {
        let mut parser = feed(false);
        assert!(
            parser
                .push(
                    true,
                    1,
                    &("AMEOW_PROGRESS=".to_owned() + &"x".repeat(MAX_LINE + 1) + "\n"),
                    0
                )
                .is_none()
        );
        for (sequence, raw) in ["not-json", "{\"status\":\"downloading\"}", "{\"status\":\"downloading\",\"format_id\":\"v\",\"downloaded_bytes\":-1,\"total_bytes\":100,\"total_bytes_estimate\":null,\"speed\":5}", "{\"status\":\"downloading\",\"format_id\":\"v\",\"downloaded_bytes\":9007199254740993,\"total_bytes\":null,\"total_bytes_estimate\":null,\"speed\":5}", "{\"status\":\"downloading\",\"format_id\":\"v\",\"downloaded_bytes\":5,\"total_bytes\":100,\"total_bytes_estimate\":null,\"speed\":1e400}"].iter().enumerate() {
            assert!(parser.push(true, sequence as u64 + 2, &format!("AMEOW_PROGRESS={raw}\n"), sequence as u64 * 200).is_none());
        }
        assert!(
            parser
                .push(true, 7, "raw engine line mentioning speed 8.2 MB/s\n", 1000)
                .is_none()
        );
        let sample = parser
            .push(
                true,
                8,
                &record("downloading", "v", 25, json!(100), json!(5)),
                1200,
            )
            .unwrap();
        assert_eq!(sample.fraction, Some(0.25));
        assert_eq!(sample.fraction_at(3200), None);
        assert_eq!(sample.speed_at(1199), None);
        assert!(
            parser
                .push(
                    true,
                    9,
                    &record("downloading", "v", 30, json!(100), json!(6)),
                    1250
                )
                .is_none()
        );
        assert!(
            parser
                .push(
                    true,
                    10,
                    &record("downloading", "v", 35, json!(100), json!(6)),
                    1400
                )
                .is_some()
        );
        let sample = parser
            .push(
                true,
                11,
                &record("finished", "v", 100, json!(100), json!(999)),
                1401,
            )
            .unwrap();
        assert_eq!(sample.speed_at(1401), None);
    }
    #[test]
    fn exact_whole_multistream_fraction_needs_all_selected_and_consistent_totals() {
        let metadata = json!({"formats":[{"format_id":"v","protocol":"https","filesize":100},{"format_id":"a","protocol":"https","filesize":50}]});
        for selector in ["v+a", "v+missing", "v+v", "v+a+other"] {
            let mut parser = ProgressFeed::new(&metadata, selector);
            let sample = parser.push(
                true,
                1,
                &record("downloading", "v", 50, json!(100), json!(5)),
                0,
            );
            assert!(sample.is_none_or(|s| s.fraction.is_none()));
        }
        let mut parser = ProgressFeed::new(&metadata, "v+a");
        parser.push(
            true,
            1,
            &record("finished", "v", 100, json!(100), json!(55)),
            0,
        );
        let sample = parser
            .push(
                true,
                2,
                &record("downloading", "a", 25, json!(50), json!(5)),
                200,
            )
            .unwrap();
        assert_eq!(sample.downloaded_bytes, 125);
        assert_eq!(sample.exact_total_bytes, Some(150));
        assert!(sample.fraction.unwrap() < 1.);
        let sample = parser
            .push(
                true,
                3,
                &record("downloading", "a", 30, json!(60), json!(5)),
                400,
            )
            .unwrap();
        assert_eq!(sample.fraction, None);
        let sample = parser
            .push(
                true,
                4,
                &record("downloading", "a", 35, json!(50), json!(5)),
                600,
            )
            .unwrap();
        assert_eq!(sample.fraction, None);
        let mut parser = feed(true);
        parser.push(
            true,
            1,
            &record("downloading", "v", 25, Value::Null, json!(5)),
            0,
        );
        let sample = parser
            .push(
                true,
                2,
                &record("downloading", "v", 35, Value::Null, json!(5)),
                200,
            )
            .unwrap();
        assert_eq!(sample.downloaded_bytes, 35);
        assert_eq!(sample.fraction, None);
        let sample = parser
            .push(
                true,
                3,
                "AMEOW_PP={\"postprocessor\":\"Merger\",\"status\":\"started\"}\n",
                201,
            )
            .unwrap();
        assert!(sample.merging);
        assert!(
            parser
                .push(
                    false,
                    1,
                    &record("downloading", "v", 40, Value::Null, json!(5)),
                    500
                )
                .is_none()
        );
    }
    #[test]
    #[ignore = "requires task-owned pinned native-records.py evidence; no public site claim"]
    fn pinned_native_selected_record_evidence() -> Result<(), String> {
        let root = std::path::PathBuf::from(
            std::env::var("AMEOW_NATIVE_RECORD_EVIDENCE_ROOT").map_err(|e| e.to_string())?,
        );
        for case in ["native-combined", "native-separate-codec"] {
            let working = root.join(case).join("working");
            let before = super::super::read_selection(&working.join("selection.txt"))?;
            let actual = super::super::read_metadata_file(&working.join("media.info.json"))?;
            let expected = super::super::selection::expectation(
                &before,
                crate::download::request::Quality::Highest,
            )?;
            assert_eq!(
                expected,
                super::super::selection::expectation(
                    &actual,
                    crate::download::request::Quality::Highest
                )?
            );
            assert_eq!(expected.height, 48);
            let final_record =
                std::fs::read(working.join("final-object.txt")).map_err(|e| e.to_string())?;
            assert_eq!(
                super::super::parse_final_record(&final_record)?,
                working.join("media.mkv")
            );
            assert!(working.join("media.mkv").is_file());
            let feed = ProgressFeed::selected(&before);
            assert_eq!(
                feed.streams.len(),
                if case == "native-combined" { 1 } else { 2 }
            );
        }
        Ok(())
    }
    #[test]
    fn split_gap_privacy_and_invalid_scalars_cannot_create_a_plausible_sample() {
        let mut parser = feed(false);
        let line = record("downloading", "v", 12, json!(100), json!(5));
        assert!(parser.push(true, 1, &line[..30], 0).is_none());
        let result = parser.push(true, 2, &line[30..], 1).unwrap();
        assert_eq!(result.speed_at(1), Some(5.));
        assert_eq!(result.speed_at(2001), None);
        let mut parser = feed(false);
        assert!(parser.push(true, 1, &line[..30], 0).is_none());
        assert!(parser.push(true, 3, &line[30..], 1).is_none());
        assert!(
            parser
                .push(
                    true,
                    4,
                    &record("downloading", "v", 12, json!(100), json!(-5)),
                    2
                )
                .is_none()
        );
        let leak = line
            .trim_end()
            .replace('{', "{\"url\":\"https://private.invalid/?token=canary\",");
        assert!(parser.push(true, 5, &(leak + "\n"), 3).is_none());
        let result = parser.push(true, 6, &line, 4).unwrap();
        assert!(!serde_json::to_string(&result).unwrap().contains("token"));
        assert!(
            parser
                .push(false, 1, &"x".repeat(MAX_LINE + 10), 5)
                .is_none()
        );
    }
    #[test]
    fn finished_average_unknown_fragment_total_and_partial_stream_never_prove_whole_job() {
        let mut parser = feed(true);
        let sample = parser
            .push(
                true,
                1,
                &record("downloading", "v", 20, json!(100), json!(5)),
                0,
            )
            .unwrap();
        assert_eq!(sample.fraction, None);
        let sample = parser
            .push(
                true,
                2,
                &record("finished", "v", 100, json!(100), json!(50)),
                1,
            )
            .unwrap();
        assert_eq!(sample.bytes_per_second, None);
        assert_eq!(sample.fraction, None);
        let mut parser = ProgressFeed::new(
            &json!({"formats":[{"format_id":"v","protocol":"https"},{"format_id":"a","protocol":"https"}]}),
            "v+a",
        );
        let sample = parser
            .push(
                true,
                1,
                &record("finished", "v", 100, json!(100), json!(50)),
                0,
            )
            .unwrap();
        assert_eq!(sample.fraction, None);
        let sample = parser
            .push(
                true,
                2,
                &record("downloading", "a", 20, Value::Null, json!(5)),
                200,
            )
            .unwrap();
        assert_eq!(sample.fraction, None);
        assert_eq!(sample.speed_at(200), Some(5.));
        assert!(
            parser
                .push(
                    true,
                    3,
                    "AMEOW_PP={\"postprocessor\":\"VideoRemuxer\",\"status\":\"started\"}\n",
                    300
                )
                .is_none()
        );
        let sample = parser
            .push(
                true,
                4,
                "AMEOW_PP={\"postprocessor\":\"Merger\",\"status\":\"started\"}\n",
                301,
            )
            .unwrap();
        assert!(sample.merging);
        assert_eq!(sample.speed_at(301), None);
    }
}
