//! Session-only presentation policy. Backend history, FIFO and slot ownership stay authoritative.
use ameow_next::download::queue::{CommandReply, JobPhase, JobSnapshot, QueueSnapshot};
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub struct Presentation {
    foreground: Option<(u64, bool)>,
    terminal_until: Option<u64>,
    successes: HashMap<u64, Option<u64>>,
    dismissed: HashSet<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue_fixture::{job, snapshot};
    fn running() -> QueueSnapshot {
        snapshot(vec![
            job(1, JobPhase::Downloading, Some(1), Some(0.34)),
            job(2, JobPhase::Downloading, Some(2), None),
            job(3, JobPhase::Downloading, Some(3), Some(0.72)),
            job(4, JobPhase::Queued, None, None),
        ])
    }
    #[test]
    fn newest_actually_started_ignores_waiting_and_keeps_backend_oldest_projection() {
        let mut policy = Presentation::default();
        let s = running();
        assert_eq!(s.main_job, Some(1));
        assert_eq!(policy.update(&s, false, 0), Some(3));
        assert_eq!(s.main_job, Some(1));
        assert_eq!(s.active_slots, 3);
        assert!(!s.jobs[3].slot_owned);
        assert_eq!(s.jobs[3].start_order, None);
    }
    #[test]
    fn foreground_success_holds_once_then_reads_fresh_remaining_job_progress() {
        let mut policy = Presentation::default();
        let mut s = running();
        assert_eq!(policy.update(&s, false, 0), Some(3));
        s.jobs[2] = job(3, JobPhase::Success, Some(3), None);
        s.jobs[3] = job(4, JobPhase::Downloading, Some(4), Some(0.19));
        assert_eq!(policy.update(&s, false, 100), Some(3));
        assert_eq!(policy.update(&s, false, 1599), Some(3));
        s.jobs[3].transfer_progress.as_mut().unwrap().fraction = Some(0.61);
        assert_eq!(policy.update(&s, false, 1600), Some(4));
        assert_eq!(
            s.jobs[3].transfer_progress.as_ref().unwrap().fraction,
            Some(0.61)
        );
        // Background completion neither steals the foreground nor extends its clock.
        s.jobs[0] = job(1, JobPhase::Success, Some(1), None);
        assert_eq!(policy.update(&s, false, 1700), Some(4));
        s.jobs[3] = job(4, JobPhase::Cancelled, Some(4), None);
        assert_eq!(policy.update(&s, false, 1800), Some(4));
        assert_eq!(policy.update(&s, false, 3300), Some(2));
    }
    #[test]
    fn foreground_failure_and_cancel_expire_without_replaying_retained_terminals() {
        for (terminal, retention) in [(JobPhase::Failure, 5000), (JobPhase::Cancelled, 1500)] {
            let mut policy = Presentation::default();
            let mut s = snapshot(vec![job(3, JobPhase::Downloading, Some(3), None)]);
            assert_eq!(policy.update(&s, false, 0), Some(3));
            s.jobs[0] = job(3, terminal, Some(3), None);
            assert_eq!(policy.update(&s, false, 100), Some(3));
            assert_eq!(policy.update(&s, false, 100 + retention - 1), Some(3));
            assert_eq!(policy.update(&s, false, 100 + retention), None);
            assert_eq!(policy.update(&s, false, 100 + retention + 100), None);
        }
    }
    #[test]
    fn visible_success_retires_at_500ms_independent_of_foreground_1500ms() {
        let mut policy = Presentation::default();
        let mut s = running();
        policy.update(&s, true, 0);
        s.jobs[2] = job(3, JobPhase::Success, Some(3), None);
        assert_eq!(policy.update(&s, true, 100), Some(3));
        assert!(policy.visible(&s.jobs[2], 599));
        assert!(!policy.visible(&s.jobs[2], 600));
        assert_eq!(policy.update(&s, true, 600), Some(3));
        assert_eq!(policy.update(&s, true, 1600), Some(2));
        assert!(!policy.visible(&s.jobs[2], 1600));
    }
    #[test]
    fn closed_success_and_settled_cancel_never_replay_on_open() {
        let mut policy = Presentation::default();
        let s = snapshot(vec![
            job(1, JobPhase::Success, Some(1), None),
            job(2, JobPhase::Cancelled, Some(2), None),
        ]);
        policy.update(&s, false, 0);
        policy.update(&s, true, 100);
        assert!(!policy.visible(&s.jobs[0], 100));
        assert!(!policy.visible(&s.jobs[1], 100));
        let mut open_policy = Presentation::default();
        open_policy.update(&s, true, 0);
        assert!(open_policy.visible(&s.jobs[0], 100));
        open_policy.close_queue();
        open_policy.update(&s, true, 200);
        assert!(!open_policy.visible(&s.jobs[0], 200));
    }
    #[test]
    fn retry_refusal_preserves_failure_and_accepted_retry_or_clear_only_retires_visible_row() {
        let mut policy = Presentation::default();
        let mut s = snapshot(vec![
            job(5, JobPhase::Failure, Some(5), None),
            job(6, JobPhase::Failure, Some(6), None),
        ]);
        assert_eq!(policy.failures(&s), 2);
        // Clicking/sending Retry does not change presentation; only accepted reply can retire it.
        policy.retry_reply(5, &CommandReply::Error("E_DUPLICATE".into()));
        assert!(policy.visible(&s.jobs[0], 0));
        assert_eq!(policy.failures(&s), 2);
        s.jobs.push(job(7, JobPhase::Queued, None, None));
        policy.retry_reply(5, &CommandReply::Accepted(7));
        assert!(!policy.visible(&s.jobs[0], 100));
        assert!(policy.visible(&s.jobs[2], 100));
        assert_eq!(policy.failures(&s), 1);
        assert_eq!(s.failures, 2);
        assert!(s.jobs[0].failure.is_some());
        assert_eq!(
            crate::download_ui::badge_counts(1, policy.failures(&s)),
            Some((2, true, true))
        );
        policy.clear(6);
        assert_eq!(policy.failures(&s), 0);
        assert_eq!(s.jobs.len(), 3);
        assert!(s.jobs[1].failure.is_some());
        assert_eq!(
            crate::download_ui::badge_counts(1, policy.failures(&s)),
            None
        );
    }
}
impl Presentation {
    pub fn update(&mut self, snapshot: &QueueSnapshot, open: bool, now: u64) -> Option<u64> {
        for job in &snapshot.jobs {
            if job.phase == JobPhase::Success {
                let deadline = self
                    .successes
                    .entry(job.job_id)
                    .or_insert_with(|| open.then_some(now + 500));
                if !open || deadline.is_some_and(|until| now >= until) {
                    *deadline = None;
                }
            }
        }
        if let Some((id, was_terminal)) = self.foreground
            && let Some(job) = snapshot.jobs.iter().find(|job| job.job_id == id)
            && job.phase.terminal()
        {
            if !was_terminal {
                self.terminal_until = Some(
                    now + if job.phase == JobPhase::Failure {
                        5000
                    } else {
                        1500
                    },
                );
                self.foreground = Some((id, true));
            }
            if self.terminal_until.is_some_and(|until| now < until) {
                return Some(id);
            }
        }
        self.terminal_until = None;
        let chosen = snapshot
            .jobs
            .iter()
            .filter(|job| job.slot_owned && !job.phase.terminal() && job.start_order.is_some())
            .max_by_key(|job| job.start_order)
            .or_else(|| snapshot.jobs.iter().find(|job| !job.phase.terminal()));
        self.foreground = chosen.map(|job| (job.job_id, false));
        chosen.map(|job| job.job_id)
    }
    pub fn close_queue(&mut self) {
        self.successes
            .values_mut()
            .for_each(|deadline| *deadline = None);
    }
    pub fn visible(&self, job: &JobSnapshot, now: u64) -> bool {
        match job.phase {
            JobPhase::Success => self
                .successes
                .get(&job.job_id)
                .copied()
                .flatten()
                .is_some_and(|until| now < until),
            JobPhase::Cancelled => false,
            JobPhase::Failure => !self.dismissed.contains(&job.job_id),
            _ => true,
        }
    }
    pub fn failures(&self, snapshot: &QueueSnapshot) -> usize {
        snapshot
            .jobs
            .iter()
            .filter(|job| job.phase == JobPhase::Failure && !self.dismissed.contains(&job.job_id))
            .count()
    }
    pub fn clear(&mut self, job: u64) {
        self.dismissed.insert(job);
    }
    pub fn retry_reply(&mut self, source: u64, reply: &CommandReply) {
        if matches!(reply, CommandReply::Accepted(_)) {
            self.clear(source);
        }
    }
}
