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
    pub(super) fn finish_shortcut(&mut self, cx: &mut Context<Self>) {
        if !self.shortcut_recording && self.shortcut_draft.is_none() { return; }
        self.shortcut_recording = false;
        if let Some(chord) = self.shortcut_draft.take() {
            self.save_shortcut(ShortcutPreference { chord: Some(chord) }, cx);
        } else {
            let _ = self.main.update(cx, |main, cx| { main.shortcut.resume(); cx.notify(); });
            cx.notify();
        }
    }
    pub(super) fn shortcut_accessibility_label(&self) -> String {
        let l = self.projection.language;
        let value = self.shortcut_draft.as_ref().or_else(|| self.projection.shortcut.as_ref().and_then(|p| p.chord.as_ref()))
            .map(|chord| chord.accessible_label()).unwrap_or_else(|| l.text("未设置", "Not set").into());
        format!("{}: {value}", l.text("修改呼出快捷键", "Change summon shortcut"))
    }
    fn begin_shortcut(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.projection.pending || self.picker_pending { return; }
        self.copy_feedback.remove("shortcut");
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
            self.finish_shortcut(cx); self.move_focus(event.keystroke.modifiers.shift, window, cx); return true;
        }
        if event.is_held { return true; }
        if matches!(event.keystroke.key.as_str(), "control" | "ctrl" | "alt" | "shift" | "cmd" | "super" | "win" | "fn") { return true; }
        match crate::global_shortcut::record(event) {
            Ok(chord) => { self.shortcut_draft = Some(chord); self.shortcut_notice = None; }
            Err(error) => { self.shortcut_draft = None; self.shortcut_notice = Some(error); }
        }
        cx.notify(); true
    }
    fn save_shortcut(&mut self, preference: ShortcutPreference, cx: &mut Context<Self>) {
        if self.projection.preview { self.cancel_shortcut(cx); return; }
        self.shortcut_recording = false;
        self.shortcut_draft = None;
        self.copy_feedback.remove("shortcut");
        if self.projection.pending || self.picker_pending {
            let unavailable = self.main.update(cx, |main, cx| { main.shortcut.resume(); cx.notify(); main.shortcut.error.is_some() }).unwrap_or(false);
            self.shortcut_notice = Some(if unavailable { "save-restore" } else { "busy" }.into()); cx.notify(); return;
        }
        let result = self.main.update(cx, |main, cx| {
            if !main.shortcut_allowed { return Err("busy".to_owned()); }
            let result = main.shortcut.prepare(preference.clone()).and_then(|()| {
                let now = main.now();
                if main.downloads.as_mut().is_some_and(|ui| ui.request_shortcut(preference, now)) { Ok(()) }
                else { main.shortcut.complete(false); Err(main.shortcut.error.clone().unwrap_or_else(|| "save".into())) }
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
        let saving = self.projection.shortcut_pending;
        let saved = self.copy_feedback.contains_key("shortcut") && !saving && !self.shortcut_recording;
        let error = self.shortcut_notice.as_ref().or_else(|| {
            if self.shortcut_recording { None } else { self.projection.shortcut_error.as_ref() }
        });
        let label = if saving { l.text("保存中…", "Saving…").into() }
        else if self.shortcut_recording && self.shortcut_draft.is_none() {
            l.text("按下组合键…", "Press shortcut…").to_owned()
        } else { combo.map(|chord| chord.label()).unwrap_or_else(|| l.text("设置快捷键", "Set shortcut").into()) };
        let (container, focus) = self.control_container("shortcut-record", enabled, cx);
        let hint = format!("{}{}", combo.map(|chord| format!("{} · ", chord.label())).unwrap_or_default(),
            l.text("点击后按下新的组合键", "Click, then press a new shortcut"));
        let recorder = container.flex_1().min_w(px(0.)).h_full().child(
            gpui_base::Button::new("shortcut-record").track_focus(&focus).disabled(!enabled)
                .accessibility_label(if saving { l.text("正在保存呼出快捷键", "Saving summon shortcut").into() } else { self.shortcut_accessibility_label() })
                .w_full().h_full().px(px(10.)).flex().items_center().justify_start().gap(px(6.))
                .rounded(px(tokens::CONTROL_RADIUS)).border_1().border_color(transparent_black())
                .text_size(px(tokens::CONTROL_FONT_SIZE)).line_height(px(tokens::CONTROL_LINE_HEIGHT))
                .text_color(if enabled { p.primary_text() } else { p.neutral })
                .child(div().min_w(px(0.)).truncate().child(label))
                .when(saved, |s| s.child(svg().path("icons/check.svg").size(px(14.)).flex_none().text_color(p.green)))
                .when(enabled, |s| s.cursor_pointer().hover(move |s| s.bg(p.badge)).active(move |s| s.bg(p.border))
                    .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                    .when(!self.shortcut_recording, |s| s.tooltip_above(&self.tooltips, move |_, cx| cx.new(|_| HelpTooltip { text: hint.clone(), night: p.night }).into()))
                    .on_click(cx.listener(|this, _, window, cx| this.begin_shortcut(window, cx)))));
        let clear = self.icon_button("shortcut-clear", "icons/x.svg",
            l.text("清空呼出快捷键", "Clear summon shortcut"), enabled, cx,
            |this, window, cx| {
                this.save_shortcut(ShortcutPreference { chord: None }, cx);
                if let Some(focus) = this.control_focus.borrow().get("shortcut-record") { window.focus(focus, cx); }
            });
        let controls = div().w(px(tokens::SETTINGS_CONTROL_WIDTH)).h(px(tokens::CONTROL_HEIGHT))
            .flex_none().flex().items_center().rounded(px(tokens::CONTROL_RADIUS))
            .border_1().border_color(if error.is_some() { error_text(p) } else if self.shortcut_recording { p.blue } else { p.control_border() })
            .bg(if self.shortcut_recording { p.badge.opacity(0.55) } else { p.surface }).child(recorder)
            .when(combo.is_some(), |s| s.child(div()
                // Keep recorder focus until clear handles the click, so blur cannot save its draft first.
                .capture_any_mouse_down(|_, window, _| window.prevent_default()).child(clear)));
        div().mt(px(24.)).flex().flex_col().gap(px(8.))
            .child(div().text_size(px(13.)).font_weight(FontWeight::MEDIUM).child(l.text("快捷键", "Shortcut")))
            .child(div().min_h(px(tokens::SETTINGS_ROW_HEIGHT)).flex().items_center().justify_between().gap(px(12.))
                .child(div().child(l.text("呼出／隐藏 Ameow", "Show / hide Ameow"))).child(controls))
            .when_some(error, |s, error| {
                let reason = crate::global_shortcut::error_text(error, l);
                let (container, focus) = self.control_container("shortcut-repair", enabled, cx);
                let accessible = format!("{reason}. {}", l.text("修改快捷键", "Change shortcut"));
                s.child(container.child(gpui_base::Button::new("shortcut-repair").track_focus(&focus).disabled(!enabled)
                    .accessibility_label(accessible).w_full().min_h(px(36.)).h_auto().px(px(10.)).py(px(8.)).gap(px(8.))
                    .rounded(px(tokens::CONTROL_RADIUS)).border_1().border_color(transparent_black())
                    .bg(p.red.opacity(if p.night { 0.12 } else { 0.07 })).text_color(error_text(p))
                    .text_size(px(tokens::CONTROL_FONT_SIZE)).line_height(px(tokens::CONTROL_LINE_HEIGHT))
                    .child(svg().path("icons/circle-alert.svg").size(px(14.)).flex_none().text_color(error_text(p)))
                    .child(div().flex_1().min_w(px(0.)).child(reason))
                    .child(div().flex_none().text_color(p.primary_text()).child(l.text("修改", "Change")))
                    .when(enabled, |s| s.cursor_pointer().hover(move |s| s.bg(p.red.opacity(if p.night { 0.18 } else { 0.10 })))
                        .active(move |s| s.bg(p.red.opacity(if p.night { 0.22 } else { 0.14 })))
                        .when(self.keyboard_focus, |s| s.focus(move |s| s.border_color(p.blue)))
                        .on_click(cx.listener(|this, _, window, cx| this.begin_shortcut(window, cx))))))
            })
            .into_any_element()
    }
}
