//! About's local, virtualized reader for the current executable's notice text.
use super::{Page, SettingsWindow};
use crate::{tokens::Palette, ui_text::Language};
use gpui::{prelude::*, *};
use std::sync::OnceLock;

fn lines() -> &'static Vec<&'static str> {
    static LINES: OnceLock<Vec<&'static str>> = OnceLock::new();
    LINES.get_or_init(|| ameow_next::third_party_notices::TEXT.lines().collect())
}

impl SettingsWindow {
    pub(super) fn open_notices(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.help_open = None;
        self.notices_open = true;
        self.notices_copied = None;
        self.notices_scroll.scroll_to(ListOffset::default());
        self.scroll.set_offset(point(px(0.), px(0.)));
        window.focus(&self.notices_focus, cx);
        cx.notify();
    }

    pub(super) fn close_notices(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.notices_open = false;
        if let Some(focus) = self.control_focus.borrow().get("third-party-licenses") {
            window.focus(focus, cx);
        }
        cx.notify();
    }

    pub(super) fn notices_key(
        &mut self,
        key: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.page != Page::About || !self.notices_open {
            return false;
        }
        if key == "escape" {
            self.close_notices(window, cx);
            return true;
        }
        if !self.notices_focus.is_focused(window) {
            return false;
        }
        let index = self.notices_scroll.logical_scroll_top().item_ix;
        let target = match key {
            "home" => 0,
            "end" => lines().len() - 1,
            "up" => index.saturating_sub(1),
            "down" => (index + 1).min(lines().len() - 1),
            "pageup" => index.saturating_sub(12),
            "pagedown" | "space" => (index + 12).min(lines().len() - 1),
            _ => return false,
        };
        self.notices_scroll.scroll_to(ListOffset {
            item_ix: target,
            offset_in_item: px(0.),
        });
        cx.notify();
        true
    }

    pub(super) fn notices_page(&self, cx: &mut Context<Self>) -> AnyElement {
        let l: Language = self.projection.language;
        let p = Palette::new(self.projection.night);
        let scroll = self.notices_scroll.clone();
        div()
            .size_full()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .pb(px(16.))
                    .child(self.icon_button(
                        "close-notices",
                        "icons/arrow-left.svg",
                        l.text("返回", "Back"),
                        true,
                        cx,
                        |this, window, cx| this.close_notices(window, cx),
                    ))
                    .child(div().flex_1().min_w(px(0.)).text_size(px(18.)).line_height(px(24.))
                        .font_weight(FontWeight::MEDIUM)
                        .child(l.text("第三方许可", "Third-party licenses"))),
            )
            .child(self.notice_bar("notices-copy-error", (self.notices_copied == Some(false))
                .then(|| (l.text("无法复制，请重试。", "Could not copy. Try again.").into(), true))).mb(px(8.)))
            .child(
                div()
                    .id("notices-reader")
                    .relative()
                    .flex_1()
                    .min_h(px(0.))
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .rounded(px(6.))
                    .border_1()
                    .border_color(p.control_border())
                    .overflow_hidden()
                    .when(!self.passive.get(), |s| s.track_focus(&self.notices_focus))
                    .when(self.keyboard_focus, |s| {
                        s.focus(move |s| s.border_color(p.blue))
                    })
                    .child(
                        div().flex_none().flex().justify_end().px(px(6.)).py(px(4.))
                            .child(self.icon_button(
                                "copy-notices",
                                if self.notices_copied == Some(true) { "icons/check.svg" } else { "icons/copy.svg" },
                                if self.notices_copied == Some(true) {
                                    l.text("已复制", "Copied")
                                } else {
                                    l.text("复制全文", "Copy all")
                                },
                                true,
                                cx,
                                |this, window, cx| {
                                    let copied = this.projection.preview || crate::tray::copy_text(
                                        super::hwnd(window), ameow_next::third_party_notices::TEXT,
                                    ).is_ok();
                                    this.notices_copied = Some(copied);
                                    if copied { this.reset_copy_feedback_later("notices", cx); }
                                    cx.notify();
                                },
                            )),
                    )
                    .child(
                        div().relative().flex_1().min_h(px(0.)).min_w(px(0.)).overflow_hidden()
                            .on_children_prepainted(move |_, window, _| {
                                // List clears height hints when its width changes, including its first layout.
                                // Seed afterwards so the scrollbar covers the entire virtualized document.
                                let viewport = scroll.viewport_bounds().size.height;
                                let minimum_height = px(18.) * scroll.item_count() as f32;
                                if viewport > px(0.) && scroll.max_offset_for_scrollbar().y + viewport < minimum_height {
                                    scroll.clone().with_uniform_item_height(px(18.));
                                    window.request_animation_frame();
                                }
                            })
                            .on_mouse_down(
                                MouseButton::Left,
                                cx.listener(|this, _, window, cx| window.focus(&this.notices_focus, cx)),
                            )
                            .child(
                                list(self.notices_scroll.clone(), |index, _, _| {
                                    div()
                                        .w_full()
                                        .min_h(px(18.))
                                        .px(px(12.))
                                        .text_size(px(12.))
                                        .line_height(px(18.))
                                        .child(lines()[index])
                                        .into_any_element()
                                })
                                .size_full(),
                            )
                            .child(
                                div().absolute().inset_0().child(
                                    gpui_base::Scrollbar::vertical(&self.notices_scroll)
                                        .id("notices-scrollbar").mode(gpui_base::ScrollbarMode::Always)
                                        .styles(move |s| s
                                            .track(|s| s.width(px(10.)).bg(transparent_black()).border_color(transparent_black()))
                                            .track_hover(|s| s.width(px(10.)).bg(transparent_black()).border_color(transparent_black()))
                                            .track_active(|s| s.width(px(10.)).bg(transparent_black()).border_color(transparent_black()))
                                            .thumb(|s| s.width(px(3.)).inset(px(3.)).radius(px(1.5)).min_length(px(24.)).bg(p.neutral.opacity(0.4)))
                                            .thumb_hover(|s| s.width(px(3.)).inset(px(3.)).radius(px(1.5)).min_length(px(24.)).bg(p.neutral.opacity(0.6)))
                                            .thumb_active(|s| s.width(px(3.)).inset(px(3.)).radius(px(1.5)).min_length(px(24.)).bg(p.neutral.opacity(0.7)))),
                                ),
                            ),
                    ),
            )
            .into_any_element()
    }
}
