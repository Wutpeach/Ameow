use super::*;
use ameow_next::shortcut::ShortcutPreference;

impl SettingsWindow {
    pub(crate) fn shortcut_blocked(&self) -> bool { self.picker_pending || self.shortcut_recording }

    pub(super) fn cancel_shortcut(&mut self, cx: &mut Context<Self>) {
        if !self.shortcut_recording && self.shortcut_draft.is_none() { return; }
        self.shortcut_recording = false; self.shortcut_draft = None; self.shortcut_notice = None;
        if !self.projection.preview {
            let _ = self.main.update(cx, |main, cx| { main.shortcut.resume(); cx.notify(); });
        }
        cx.notify();
    }
    fn begin_shortcut(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.projection.pending || self.picker_pending { return; }
        self.shortcut_recording = true; self.shortcut_draft = None; self.shortcut_notice = None;
        if !self.projection.preview {
            let _ = self.main.update(cx, |main, cx| { main.shortcut.suspend(); cx.notify(); });
        }
        for select in &mut self.selects { select.open = false; }
        if let Some(focus) = self.control_focus.borrow().get("shortcut-record") { window.focus(focus, cx); }
        cx.notify();
    }
    pub(super) fn shortcut_key(&mut self, event: &KeyDownEvent, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if event.keystroke.key == "escape" && (self.shortcut_recording || self.shortcut_draft.is_some()) {
            self.cancel_shortcut(cx); return true;
        }
        if !self.shortcut_recording { return false; }
        if event.keystroke.key == "tab" {
            self.cancel_shortcut(cx); self.move_focus(event.keystroke.modifiers.shift, window, cx); return true;
        }
        if event.is_held { return true; }
        if matches!(event.keystroke.key.as_str(), "control" | "ctrl" | "alt" | "shift" | "cmd" | "super" | "win" | "fn") { return true; }
        match crate::global_shortcut::record(event) {
            Ok(chord) => { self.shortcut_draft = Some(chord); self.shortcut_notice = None; }
            Err(error) => self.shortcut_notice = Some(error),
        }
        cx.notify(); true
    }
    fn save_shortcut(&mut self, preference: ShortcutPreference, cx: &mut Context<Self>) {
        if self.projection.preview || self.projection.pending || self.picker_pending { return; }
        self.shortcut_recording = false;
        let result = self.main.update(cx, |main, cx| {
            if !main.shortcut_allowed { return Err("busy".to_owned()); }
            let result = main.shortcut.prepare(preference.clone()).and_then(|()| {
                let now = main.now();
                if main.downloads.as_mut().is_some_and(|ui| ui.request_shortcut(preference, now)) { Ok(()) }
                else { main.shortcut.complete(false); Err("save".into()) }
            });
            cx.notify(); result
        }).unwrap_or_else(|_| Err("save".into()));
        match result {
            Ok(()) => { self.shortcut_draft = None; self.shortcut_notice = None; }
            Err(error) => self.shortcut_notice = Some(error),
        }
        cx.notify();
    }
    pub(super) fn shortcut_section(&self, cx: &mut Context<Self>) -> AnyElement {
        let l = self.projection.language;
        let p = Palette::new(self.projection.night);
        let preference = self.projection.shortcut.clone().unwrap_or_default();
        let enabled = self.projection.shortcut.is_some() && !self.projection.pending && !self.picker_pending && !self.passive.get();
        let combo = self.shortcut_draft.as_ref().or(preference.chord.as_ref());
        let label = if self.shortcut_recording && self.shortcut_draft.is_none() {
            l.text("按下组合键…", "Press shortcut…").to_owned()
        } else { combo.map(|chord| chord.label()).unwrap_or_else(|| l.text("未设置", "Not set").into()) };
        let recorder = self.button("shortcut-record", label, enabled, ButtonStyle::Standard, cx,
            |this, window, cx| this.begin_shortcut(window, cx));
        let editing = self.shortcut_recording || self.shortcut_draft.is_some();
        let controls = div().flex().items_center().gap(px(12.)).child(recorder)
            .when(preference.chord.is_some() && !editing, |s| s.child(self.button("shortcut-clear", l.text("清空", "Clear"),
                enabled, ButtonStyle::Quiet, cx, |this, _, cx| this.save_shortcut(ShortcutPreference { chord: None }, cx))));
        let mut actions = div().flex().justify_end().items_center().gap(px(12.));
        if editing {
            actions = actions.child(self.button("shortcut-apply", l.text("应用", "Apply"),
                enabled && !self.shortcut_recording && self.shortcut_draft.is_some(), ButtonStyle::Standard, cx,
                |this, _, cx| {
                    let preference = ShortcutPreference { chord: this.shortcut_draft.clone() };
                    this.save_shortcut(preference, cx);
                })).child(self.button("shortcut-cancel", l.text("取消", "Cancel"), enabled, ButtonStyle::Quiet, cx,
                    |this, _, cx| this.cancel_shortcut(cx)));
        }
        let error = self.shortcut_notice.as_ref().or(self.projection.shortcut_error.as_ref());
        div().mt(px(24.)).flex().flex_col().gap(px(8.))
            .child(div().text_size(px(13.)).font_weight(FontWeight::MEDIUM).child(l.text("快捷键", "Shortcut")))
            .child(div().min_h(px(44.)).flex().items_center().justify_between().gap(px(12.))
                .child(div().child(l.text("呼出／隐藏 Ameow", "Show / hide Ameow"))).child(controls))
            .when(editing, |s| s.child(actions))
            .when(self.projection.shortcut_pending, |s| s.child(div().text_size(px(12.)).text_color(p.neutral)
                .child(l.text("正在保存…", "Saving…"))))
            .when_some(error, |s, error| s.child(div().text_size(px(12.)).text_color(error_text(p))
                .child(crate::global_shortcut::error_text(error, l))))
            .into_any_element()
    }
}
