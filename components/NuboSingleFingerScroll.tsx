"use client";

import { useEffect } from "react";

type ScrollTarget = HTMLElement | Document;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [data-nubo-touch-lock="true"]',
    ),
  );
}

function canScrollElement(element: HTMLElement, deltaY: number) {
  const maxScrollTop = element.scrollHeight - element.clientHeight;
  if (maxScrollTop <= 1) return false;
  if (deltaY > 0) return element.scrollTop < maxScrollTop - 1;
  if (deltaY < 0) return element.scrollTop > 1;
  return false;
}

function findScrollTarget(start: EventTarget | null): ScrollTarget {
  let element = start instanceof HTMLElement ? start : null;

  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll") &&
      element.scrollHeight > element.clientHeight + 1;

    if (isScrollable) return element;
    element = element.parentElement;
  }

  return document;
}

function scrollTarget(target: ScrollTarget, deltaY: number) {
  if (target instanceof HTMLElement && canScrollElement(target, deltaY)) {
    target.scrollTop += deltaY;
    return;
  }

  window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
}

/**
 * Android/PWA fallback for devices where a transparent canvas or WebView gesture
 * layer prevents the browser's native one-finger page scroll. It only handles a
 * clear vertical drag with exactly one touch and leaves taps/form controls alone.
 */
export function NuboSingleFingerScroll() {
  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (!coarsePointer) return;

    let active = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let scrollContainer: ScrollTarget = document;

    const reset = () => {
      active = false;
      moved = false;
      scrollContainer = document;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || isEditableTarget(event.target)) {
        reset();
        return;
      }

      const touch = event.touches[0];
      active = true;
      moved = false;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      scrollContainer = findScrollTarget(event.target);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!active || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const totalX = touch.clientX - startX;
      const totalY = touch.clientY - startY;
      const deltaY = lastY - touch.clientY;

      if (!moved) {
        if (Math.abs(totalY) < 6) return;
        if (Math.abs(totalY) <= Math.abs(totalX)) {
          reset();
          return;
        }
        moved = true;
      }

      if (!event.cancelable) return;
      event.preventDefault();
      scrollTarget(scrollContainer, deltaY);
      lastY = touch.clientY;
    };

    const onTouchEnd = () => reset();

    document.documentElement.classList.add(
      "nubo-single-finger-scroll-enabled",
    );
    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", onTouchEnd, {
      capture: true,
      passive: true,
    });

    return () => {
      document.documentElement.classList.remove(
        "nubo-single-finger-scroll-enabled",
      );
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, []);

  return null;
}
