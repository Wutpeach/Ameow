//! Shared hover hints, anchored to controls instead of the pointer.
use gpui::{prelude::*, *};
use gpui_base::{ElementExt as _, Placement, TooltipOverlay, TooltipRequest};
use std::{cell::{Cell, RefCell}, rc::Rc};

#[derive(Clone)]
pub struct Host {
    overlay: Entity<TooltipOverlay>,
    owner: Rc<RefCell<Option<GlobalElementId>>>,
    seen: Rc<Cell<bool>>,
    bounds: Rc<Cell<Option<Bounds<Pixels>>>>,
    pressed: Rc<Cell<Option<Bounds<Pixels>>>>,
}
impl Host {
    pub fn new(cx: &mut App) -> Self {
        Self { overlay: cx.new(|_| TooltipOverlay::new()), owner: Rc::default(), seen: Rc::default(),
            bounds: Rc::default(), pressed: Rc::default() }
    }
    fn hide(&self, cx: &mut App) {
        self.owner.borrow_mut().take();
        self.bounds.set(None);
        self.overlay.update(cx, |overlay, cx| overlay.hide(cx));
    }
}

pub trait TooltipExt: StatefulInteractiveElement + ParentElement + Sized {
    fn tooltip_above(self, host: &Host, build: impl Fn(&mut Window, &mut App) -> AnyView + 'static) -> Self {
        let host = host.clone();
        let build = Rc::new(build);
        let trigger = Rc::new(RefCell::new(None));
        let writer = trigger.clone();
        let observer = host.clone();
        self.on_prepaint(move |bounds, window, _| {
            let id = window.with_global_id("ameow-tooltip-trigger".into(), |id, _| id.clone());
            if observer.owner.borrow().as_ref() == Some(&id) {
                observer.seen.set(true); observer.bounds.set(Some(bounds));
            }
            *writer.borrow_mut() = Some((id, bounds));
        }).on_mouse_move(move |event, window, cx| {
            let Some((id, bounds)) = trigger.borrow().clone() else { return; };
            if host.owner.borrow().as_ref() == Some(&id)
                || host.pressed.get().is_some_and(|bounds| bounds.contains(&event.position)) { return; }
            *host.owner.borrow_mut() = Some(id);
            host.seen.set(true); host.bounds.set(Some(bounds));
            let build = build.clone();
            host.overlay.update(cx, |overlay, cx| {
                let bounds = Bounds::new(bounds.origin - point(px(0.), px(6.)),
                    size(bounds.size.width, bounds.size.height + px(12.)));
                overlay.request_show(TooltipRequest::new(bounds, move |window, cx| build(window, cx))
                    .with_placement(Placement::Top), window, cx);
            });
        })
    }

    fn tooltip_root(self, host: &Host) -> Self {
        host.seen.set(false);
        let press = host.clone();
        let key = host.clone();
        let check = host.clone();
        let motion = host.clone();
        let exit = host.clone();
        self.capture_any_mouse_down(move |_, _, cx| {
                press.pressed.set(press.bounds.get()); press.hide(cx);
            })
            .capture_key_down(move |_, _, cx| key.hide(cx))
            .on_mouse_move(move |event, window, cx| {
                if motion.pressed.get().is_some_and(|bounds| !bounds.contains(&event.position)) { motion.pressed.set(None); }
                if motion.bounds.get().is_some_and(|bounds| !bounds.contains(&event.position)) {
                    motion.owner.borrow_mut().take(); motion.bounds.set(None);
                    motion.overlay.update(cx, |overlay, cx| overlay.request_hide(window, cx));
                }
            })
            .on_mouse_exit(move |_, _, cx| { exit.pressed.set(None); exit.hide(cx); })
            .child(canvas(move |_, _, cx| {
                // A disappearing trigger must not leave a delayed hint behind.
                let missing = check.owner.borrow().is_some() && !check.seen.get();
                if missing { check.hide(cx); }
            }, |_, _, _, _| {}).absolute().size(px(0.)))
            .child(host.overlay.clone())
    }
}
impl<T: StatefulInteractiveElement + ParentElement> TooltipExt for T {}
