//! Optional bounded transfer facts. Never a process/file settlement authority.
use serde_json::Value;

pub const DOWNLOAD_TEMPLATE: &str = r#"download:AMEOW_PROGRESS={"status":%(progress.status)j,"format_id":%(info.format_id)j,"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"speed":%(progress.speed)j}"#;
pub const PP_TEMPLATE: &str = r#"postprocess:AMEOW_PP={"postprocessor":%(progress.postprocessor)j,"status":%(progress.status)j}"#;
use crate::download::progress::{TransferPhase, TransferProgress};
use std::{fs::OpenOptions, io::Write, sync::mpsc};

/// Explicit local diagnostic only. The callback never performs filesystem IO or waits.
/// Stream ordinals replace private format IDs; only scalar progress facts leave the adapter.
#[derive(Clone, Default)]
pub(super) struct Timeline(Option<mpsc::SyncSender<serde_json::Value>>);
impl Timeline {
    pub(super) fn from_args() -> Self {
        let args: Vec<_> = std::env::args().collect();
        let Some(path) = args.windows(2).find(|p| p[0] == "--progress-timeline").map(|p| &p[1]) else {
            return Self::default();
        };
        let Ok(mut file) = OpenOptions::new().write(true).create_new(true).open(path) else {
            return Self::default();
        };
        let (sender, receiver) = mpsc::sync_channel::<serde_json::Value>(128);
        let spawned = std::thread::Builder::new().name("sanitized-progress-timeline".into()).spawn(move || {
            for event in receiver.iter().take(8192) {
                if writeln!(file, "{event}").and_then(|_| file.flush()).is_err() { break; }
            }
        });
        Self(spawned.ok().map(|_| sender))
    }
    fn record(&self, value: serde_json::Value) {
        if let Some(sender) = &self.0 { let _ = sender.try_send(value); }
    }
}
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
    video: bool,
    audio: bool,
    contradictory: bool,
}
pub struct ProgressFeed {
    frames: [Framer; 2],
    streams: Vec<Stream>,
    latest: Option<TransferProgress>,
    last_publish: Option<u64>,
    postprocessing: bool,
    primary: Option<usize>,
    timeline: Timeline,
    clip: Option<ClipFeed>,
}
#[derive(Default)]
struct ClipBlock {
    time_us: Option<u64>,
    speed: Option<f64>,
    speed_seen: bool,
}
struct ClipFeed {
    duration_us: u64,
    block: Option<ClipBlock>,
    position_us: u64,
}
impl ClipFeed {
    fn push(&mut self, line: &[u8], now: u64) -> Option<TransferProgress> {
        let Some((key, value)) = std::str::from_utf8(line).ok().and_then(|s| s.split_once('=')) else {
            self.block = None;
            return None;
        };
        if key == "frame" {
            self.block = value.trim().parse::<u64>().ok().map(|_| ClipBlock::default());
            return None;
        }
        let block = self.block.as_mut()?;
        match key {
            "out_time_us" if block.time_us.is_none() => {
                block.time_us = value.parse::<u64>().ok().filter(|n| *n <= MAX_BYTES);
                if block.time_us.is_none() { self.block = None; }
            }
            "speed" if !block.speed_seen => {
                block.speed_seen = true;
                block.speed = value.trim().strip_suffix('x').and_then(|v| v.parse::<f64>().ok())
                    .filter(|s| s.is_finite() && *s >= 0.);
                if block.speed.is_none() && value.trim() != "N/A" { self.block = None; }
            }
            "progress" => {
                let block = self.block.take()?;
                let time = block.time_us.filter(|t| *t >= self.position_us)?;
                if !block.speed_seen || !matches!(value, "continue" | "end") { return None; }
                self.position_us = time;
                return Some(TransferProgress {
                    phase: if value == "end" { TransferPhase::Processing } else { TransferPhase::Clip },
                    fraction: (value == "continue").then(|| (time as f64 / self.duration_us as f64).min(1.) as f32),
                    media_speed: (value == "continue").then_some(block.speed).flatten(),
                    observed_at_ms: now,
                    ..Default::default()
                });
            }
            "fps" | "bitrate" | "total_size" | "out_time_ms" | "out_time" | "dup_frames" | "drop_frames" => {}
            key if key.starts_with("stream_") && key.ends_with("_q") => {}
            _ => self.block = None,
        }
        None
    }
}
fn scalar_bytes(value: &Value) -> Option<u64> {
    if let Some(n) = value.as_u64() {
        return (n <= MAX_BYTES).then_some(n);
    }
    // Native fragment estimates use integral JSON floats, even for exact byte counts.
    value.as_f64()
        .filter(|n| n.is_finite() && *n >= 0. && *n <= MAX_BYTES as f64 && n.fract() == 0.)
        .map(|n| n as u64)
}
impl ProgressFeed {
    pub fn selected(metadata: &Value) -> Self {
        let mut streams = Vec::new();
        let selected_streams = super::selection::chosen(metadata);
        let selected_count = selected_streams.len();
        for selected in selected_streams.into_iter().take(3) {
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
                    video: selected["vcodec"].as_str().is_some_and(|c| c != "none"),
                    audio: selected["vcodec"] == "none" && selected["acodec"].as_str().is_some_and(|c| c != "none"),
                    contradictory: false,
                });
            }
        }
        if streams.len() != selected_count
            || streams.len() > 2
            || streams
                .iter()
                .enumerate()
                .any(|(i, s)| streams.iter().take(i).any(|other| other.id == s.id))
        {
            streams.clear();
        }
        let primary = if streams.len() == 1 { Some(0) } else {
            let video: Vec<_> = streams.iter().enumerate().filter(|(_, s)| s.video).map(|(i, _)| i).collect();
            (video.len() == 1).then(|| video[0])
        };
        Self {
            primary,
            timeline: Timeline::default(),
            frames: Default::default(),
            streams,
            latest: None,
            last_publish: None,
            postprocessing: false,
            clip: None,
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
                    video: selected["vcodec"].as_str().is_some_and(|c| c != "none"),
                    audio: selected["vcodec"] == "none" && selected["acodec"].as_str().is_some_and(|c| c != "none"),
                    contradictory: false,
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
        let primary = if streams.len() == 1 { Some(0) } else {
            let video: Vec<_> = streams.iter().enumerate().filter(|(_, s)| s.video).map(|(i, _)| i).collect();
            (video.len() == 1).then(|| video[0])
        };
        Self {
            primary,
            timeline: Timeline::default(),
            frames: Default::default(),
            streams,
            latest: None,
            last_publish: None,
            postprocessing: false,
            clip: None,
        }
    }
    pub(super) fn with_timeline(mut self, timeline: Timeline) -> Self {
        self.timeline = timeline;
        self
    }
    pub(super) fn with_clip(mut self, range: Option<crate::download::request::ClipRange>) -> Self {
        if let Some(range) = range.filter(|r| r.end_ms > r.start_ms)
            && self.primary.is_some()
        {
            self.clip = Some(ClipFeed { duration_us: (range.end_ms - range.start_ms) * 1000, block: None, position_us: 0 });
        }
        self
    }
    pub fn push(
        &mut self,
        stderr: bool,
        sequence: u64,
        text: &str,
        now: u64,
    ) -> Option<TransferProgress> {
        let frame = &mut self.frames[usize::from(stderr)];
        if !stderr && (sequence != frame.sequence.saturating_add(1) || text.len() > 24_576)
            && let Some(clip) = &mut self.clip
        { clip.block = None; }
        let lines = frame.push(sequence, text);
        let mut changed = false;
        let mut urgent = false;
        for line in lines {
            if !stderr && !self.postprocessing
                && let Some(clip) = &mut self.clip
                && let Some(sample) = clip.push(&line, now)
            {
                urgent |= sample.phase == TransferPhase::Processing;
                self.postprocessing |= sample.phase == TransferPhase::Processing;
                self.timeline.record(serde_json::json!({"observed_at_ms":now,"phase":sample.phase,
                    "position_us":clip.position_us,"duration_us":clip.duration_us,"fraction":sample.fraction,"media_speed":sample.media_speed}));
                self.latest = Some(sample);
                changed = true;
            } else if let Some(raw) = line.strip_prefix(b"AMEOW_PP=") {
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
                    media_speed: None,
                    fraction: None,
                    observed_at_ms: now,
                    merging: value["status"] == "started",
                    phase: TransferPhase::Processing,
                    estimated_total_bytes: None,
                });
                self.timeline.record(serde_json::json!({"observed_at_ms":now,"phase":"Processing","merging":value["status"] == "started","fraction":null}));
                changed = true;
                urgent = true;
            } else if let Some(raw) = line.strip_prefix(b"AMEOW_PROGRESS=") {
                // The external downloader's final file size is not clip network progress.
                if self.clip.is_some() { continue; }
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
                let Some(index) = self.streams.iter().position(|stream| stream.id == id) else {
                    continue;
                };
                let Some(stream) = self.streams.get_mut(index) else {
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
                        stream.contradictory = true;
                        stream.total = None;
                    } else if total.is_some() && !stream.contradictory {
                        stream.total = total;
                    }
                }
                if stream.total.is_some_and(|total| bytes > total) {
                    stream.contradictory = true;
                    stream.total = None;
                }
                let exact_total_bytes = (!stream.fragmented && !stream.contradictory)
                    .then_some(stream.total).flatten();
                let estimated_total_bytes = if exact_total_bytes.is_none() && !stream.contradictory {
                    scalar_bytes(&value["total_bytes_estimate"]).filter(|total| *total > 0 && bytes <= *total)
                } else { None };
                let phase = if Some(index) == self.primary && status == "downloading" {
                    TransferPhase::Primary
                } else if stream.audio && status == "downloading" {
                    TransferPhase::Audio
                } else { TransferPhase::Processing };
                let fraction = (phase == TransferPhase::Primary).then(|| {
                    exact_total_bytes.or(estimated_total_bytes)
                        .filter(|total| *total > 0 && bytes <= *total)
                        .map(|total| (bytes as f64 / total as f64) as f32)
                }).flatten();
                urgent |= self.latest.as_ref().is_some_and(|last| last.phase != phase);
                self.latest = Some(TransferProgress {
                    downloaded_bytes: bytes,
                    exact_total_bytes,
                    estimated_total_bytes,
                    phase,
                    bytes_per_second: if status == "downloading" { speed } else { None },
                    media_speed: None,
                    fraction,
                    observed_at_ms: now,
                    merging: false,
                });
                self.timeline.record(serde_json::json!({
                    "stream":index,"primary_stream":self.primary,"observed_at_ms":now,
                    "status":status,"downloaded_bytes":bytes,"total_bytes":total,
                    "total_bytes_estimate":scalar_bytes(&value["total_bytes_estimate"]),
                    "exact_total_bytes":exact_total_bytes,"estimated_total_bytes":estimated_total_bytes,
                    "old_all_streams_exact":!self.streams.is_empty() && self.streams.iter().all(|s| s.seen && !s.fragmented && s.total.is_some()),
                    "phase":phase,"fraction":fraction,"fresh_for_ms":crate::download::progress::MAX_AGE_MS
                }));
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
    fn clip_feed() -> ProgressFeed {
        let metadata = json!({"format_id":"v","protocol":"https","vcodec":"h264","acodec":"aac"});
        ProgressFeed::selected(&metadata).with_clip(Some(crate::download::request::ClipRange { start_ms: 2000, end_ms: 10000, precise: false }))
    }
    fn clip_record(time: &str, speed: &str, status: &str) -> String {
        format!("frame=25\nfps=17.8\nstream_0_0_q=-1.0\nbitrate=2600kbits/s\ntotal_size=2621488\nout_time_us={time}\nout_time_ms={time}\nout_time=00:00:02.000000\ndup_frames=0\ndrop_frames=0\nspeed={speed}\nprogress={status}\n")
    }
    #[test]
    fn clip_native_time_and_multiplier_are_never_download_byte_facts() {
        let mut feed = clip_feed();
        for (i, time) in [2000000, 4000000, 6000000].into_iter().enumerate() {
            let sample = feed.push(false, i as u64 + 1, &clip_record(&time.to_string(), "0.713x", "continue"), i as u64 * 250).unwrap();
            assert_eq!(sample.phase, TransferPhase::Clip);
            assert_eq!(sample.fraction_at(i as u64 * 250), Some(time as f32 / 8000000.));
            assert_eq!(sample.media_speed_at(i as u64 * 250), Some(0.713));
            assert_eq!(sample.media_speed_at(i as u64 * 250 + 2000), None);
            assert_eq!((sample.downloaded_bytes, sample.exact_total_bytes, sample.estimated_total_bytes, sample.speed_at(i as u64 * 250)), (0, None, None, None));
        }
        let ended = feed.push(false, 4, &clip_record("8005333", "0.71x", "end"), 800).unwrap();
        assert_eq!((ended.phase, ended.fraction_at(800), ended.media_speed_at(800)), (TransferPhase::Processing, None, None));
        assert!(feed.push(false, 5, &clip_record("8006000", "1x", "continue"), 1050).is_none());
    }
    #[test]
    fn clip_blocks_require_complete_stdout_without_gaps_or_invalid_scalars() {
        let record = clip_record("2000000", "0.7x", "continue");
        for cut in 1..record.len() {
            let mut feed = clip_feed();
            assert!(feed.push(false, 1, &record[..cut], 0).is_none());
            assert_eq!(feed.push(false, 2, &record[cut..], 250).unwrap().fraction, Some(0.25));
            let mut feed = clip_feed();
            assert!(feed.push(false, 1, &record[..cut], 0).is_none());
            assert!(feed.push(false, 3, &record[cut..], 250).is_none());
            assert_eq!(feed.push(false, 4, &record, 500).unwrap().fraction, Some(0.25));
        }
        for (time, speed) in [("-1", "0.7x"), ("1.5", "0.7x"), ("2000000", "NaNx"), ("2000000", "infx"), ("2000000", "-1x")] {
            assert!(clip_feed().push(false, 1, &clip_record(time, speed, "continue"), 0).is_none());
        }
        let unknown = clip_feed().push(false, 1, &clip_record("2000000", "N/A", "continue"), 0).unwrap();
        assert_eq!((unknown.fraction, unknown.media_speed), (Some(0.25), None));
        assert!(clip_feed().push(true, 1, &record, 0).is_none());
        assert!(feed(false).push(false, 1, &record, 0).is_none());
        assert!(ProgressFeed::selected(&Value::Null).with_clip(Some(crate::download::request::ClipRange { start_ms: 0, end_ms: 8000, precise: false })).push(false, 1, &record, 0).is_none());
    }
    #[test]
    fn native_float_estimates_keep_live_fragment_progress_but_reject_invalid_byte_counts() {
        let mut parser = feed(true);
        for (index, bytes) in [1024, 64512, 130048, 261120].into_iter().enumerate() {
            let line = format!(
                "AMEOW_PROGRESS={{\"status\":\"downloading\",\"format_id\":\"v\",\"downloaded_bytes\":{bytes},\"total_bytes\":null,\"total_bytes_estimate\":458532.0,\"speed\":104698.59329996954}}\n"
            );
            let sample = parser.push(false, index as u64 + 1, &line, index as u64 * 250).unwrap();
            assert_eq!(sample.downloaded_bytes, bytes);
            assert_eq!(sample.exact_total_bytes, None);
            assert_eq!(sample.estimated_total_bytes, Some(458532));
            assert_eq!(sample.fraction, Some(bytes as f32 / 458532.));
        }
        for raw in ["-1", "-1.0", "1.5", "9007199254740993", "9007199254740994.0", "1e300", "null", "\"458532.0\""] {
            assert_eq!(scalar_bytes(&serde_json::from_str(raw).unwrap()), None, "{raw}");
        }
    }
    #[test]
    fn incomplete_selected_identity_never_promotes_audio_to_primary() {
        for invalid_id in [Value::Null, json!(""), json!("x".repeat(129))] {
            let mut parser = ProgressFeed::selected(&json!({"requested_formats":[
                {"format_id":invalid_id,"protocol":"https","vcodec":"avc1","acodec":"none"},
                {"format_id":"a","protocol":"https","vcodec":"none","acodec":"aac"}
            ]}));
            assert!(parser.push(true, 1, &record("downloading", "a", 25, json!(100), json!(5)), 0).is_none());
        }
    }
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
    fn primary_video_has_progress_before_audio_and_never_claims_delivery() {
        let metadata = json!({"formats":[{"format_id":"v","protocol":"https","filesize":100,"vcodec":"avc1","acodec":"none"},{"format_id":"a","protocol":"https","filesize":50,"vcodec":"none","acodec":"aac"}]});
        let mut parser = ProgressFeed::new(&metadata, "v+a");
        let sample = parser.push(true, 1, &record("downloading", "v", 25, json!(100), json!(5)), 0).unwrap();
        assert_eq!(sample.fraction_at(0), Some(0.25));
        assert_eq!(sample.exact_total_bytes, Some(100));
        assert_eq!(sample.phase, TransferPhase::Primary);
        assert_eq!(sample.fraction_at(2000), None);
        let sample = parser.push(true, 2, &record("downloading", "v", 70, json!(100), json!(5)), 200).unwrap();
        assert_eq!(sample.fraction, Some(0.7));
        let sample = parser.push(true, 3, &record("finished", "v", 100, json!(100), json!(999)), 201).unwrap();
        assert_eq!(sample.fraction, None);
        assert_eq!(sample.phase, TransferPhase::Processing);
        assert_eq!(sample.speed_at(201), None);
        let sample = parser.push(true, 4, &record("downloading", "a", 25, json!(50), json!(5)), 202).unwrap();
        assert_eq!(sample.phase, TransferPhase::Audio);
        assert_eq!(sample.fraction_at(202), None);
        assert_eq!(sample.downloaded_bytes, 25);
        assert_eq!(sample.speed_at(202), Some(5.));
        let mut parser = ProgressFeed::new(&metadata, "a+v");
        let sample = parser.push(true, 1, &record("downloading", "v", 40, json!(100), json!(5)), 0).unwrap();
        assert_eq!(sample.fraction, Some(0.4));
        for selector in ["v+missing", "v+v", "v+a+other"] {
            let mut parser = ProgressFeed::new(&metadata, selector);
            assert!(parser.push(true, 1, &record("downloading", "v", 50, json!(100), json!(5)), 0).is_none());
        }
    }
    #[test]
    fn estimate_is_explicit_fresh_and_bounded_and_contradiction_stays_unknown() {
        let mut parser = feed(true);
        let sample = parser.push(true, 1, &record("downloading", "v", 90, Value::Null, json!(5)), 0).unwrap();
        assert_eq!(sample.exact_total_bytes, None);
        assert_eq!(sample.estimated_total_bytes, Some(900));
        assert_eq!(sample.fraction, Some(0.1));
        assert_eq!(sample.fraction_at(2000), None);
        let sample = parser.push(true, 2, &record("downloading", "v", 901, Value::Null, json!(5)), 200).unwrap();
        assert_eq!(sample.estimated_total_bytes, None);
        assert_eq!(sample.fraction, None);
        let mut parser = feed(false);
        parser.push(true, 1, &record("downloading", "v", 20, json!(100), json!(5)), 0);
        let sample = parser.push(true, 2, &record("downloading", "v", 30, json!(120), json!(5)), 200).unwrap();
        assert_eq!(sample.fraction, None);
        assert_eq!(sample.estimated_total_bytes, None);
        let sample = parser.push(true, 3, &record("downloading", "v", 40, json!(100), json!(5)), 400).unwrap();
        assert_eq!(sample.fraction, None);
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
            );
            assert_eq!(
                expected,
                super::super::selection::expectation(
                    &actual,
                    crate::download::request::Quality::Highest
                )
            );
            assert_eq!(expected.height, Some(48));
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
        assert_eq!(sample.estimated_total_bytes, Some(900));
        assert!(sample.fraction.is_some());
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
