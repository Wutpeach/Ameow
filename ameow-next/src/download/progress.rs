//! Optional neutral measurements, never settlement authority.
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
pub const MAX_AGE_MS: u64 = 2_000;
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis().min(u64::MAX as u128) as u64)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TransferProgress {
    pub downloaded_bytes: u64,
    pub exact_total_bytes: Option<u64>,
    pub bytes_per_second: Option<f64>,
    pub fraction: Option<f32>,
    pub observed_at_ms: u64,
    pub merging: bool,
}
impl TransferProgress {
    pub fn recent(&self, now: u64) -> bool {
        now >= self.observed_at_ms && now - self.observed_at_ms < MAX_AGE_MS
    }
    pub fn speed_at(&self, now: u64) -> Option<f64> {
        self.bytes_per_second
            .filter(|speed| !self.merging && self.recent(now) && speed.is_finite() && *speed >= 0.)
    }
    pub fn fraction_at(&self, now: u64) -> Option<f32> {
        self.fraction.filter(|fraction| {
            !self.merging
                && self.recent(now)
                && fraction.is_finite()
                && (0. ..=1.).contains(fraction)
        })
    }
}
