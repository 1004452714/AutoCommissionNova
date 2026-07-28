(function () {
    "use strict";

    const instances = new WeakMap();
    let active = null;

    function optionItems(select) {
        return Array.from(select.options).map((option, index) => ({
            index,
            value: option.value,
            label: option.textContent || option.value,
            disabled: option.disabled,
        }));
    }

    function naturalWidth(button, items) {
        const measure = document.createElement("span");
        const style = getComputedStyle(button);
        measure.className = "mask-select-measure";
        measure.style.font = style.font;
        document.body.appendChild(measure);
        let width = 0;
        for (const item of items) {
            measure.textContent = item.label;
            width = Math.max(width, measure.getBoundingClientRect().width);
        }
        measure.remove();
        return Math.ceil(width + 46);
    }

    function close(instance = active, restoreFocus = false) {
        if (!instance) return;
        instance.popup.remove();
        instance.button.setAttribute("aria-expanded", "false");
        if (restoreFocus) instance.button.focus();
        if (active === instance) active = null;
    }

    function position(instance) {
        const rect = instance.button.getBoundingClientRect();
        const popupRect = instance.popup.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + popupRect.width > window.innerWidth - 8) left = Math.max(8, rect.right - popupRect.width);
        if (top + popupRect.height > window.innerHeight - 8) top = Math.max(8, rect.top - popupRect.height - 4);
        instance.popup.style.left = left + "px";
        instance.popup.style.top = top + "px";
    }

    function focusOption(instance, index) {
        const buttons = Array.from(instance.popup.querySelectorAll(".mask-select-option:not(:disabled)"));
        if (!buttons.length) return;
        const current = Math.max(0, Math.min(index, buttons.length - 1));
        buttons.forEach((button, itemIndex) => button.classList.toggle("focused", itemIndex === current));
        buttons[current].focus();
        buttons[current].scrollIntoView({ block: "nearest" });
    }

    function choose(instance, item) {
        if (item.disabled) return;
        instance.select.value = item.value;
        refreshInstance(instance);
        close(instance, true);
        instance.select.dispatchEvent(new Event("input", { bubbles: true }));
        instance.select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function open(instance) {
        if (instance.select.disabled) return;
        if (active === instance) return close(instance, true);
        close();
        refreshInstance(instance);
        const items = optionItems(instance.select);
        const popup = document.createElement("div");
        popup.className = "mask-select-popup";
        popup.setAttribute("role", "listbox");
        popup.style.width = instance.button.getBoundingClientRect().width + "px";
        popup.innerHTML = items.map(item => `<button class="mask-select-option${item.value === instance.select.value ? " selected" : ""}" data-option-index="${item.index}" type="button" role="option" aria-selected="${item.value === instance.select.value}" ${item.disabled ? "disabled" : ""}></button>`).join("");
        Array.from(popup.children).forEach((button, index) => {
            button.textContent = items[index].label;
            button.addEventListener("click", () => choose(instance, items[index]));
        });
        popup.addEventListener("keydown", event => {
            const enabled = Array.from(popup.querySelectorAll(".mask-select-option:not(:disabled)"));
            const current = enabled.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = (Math.max(0, current) + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
                focusOption(instance, next);
            } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                document.activeElement?.click();
            } else if (event.key === "Escape") {
                event.preventDefault();
                close(instance, true);
            }
        });
        document.body.appendChild(popup);
        instance.popup = popup;
        active = instance;
        instance.button.setAttribute("aria-expanded", "true");
        position(instance);
        const selected = items.findIndex(item => item.value === instance.select.value && !item.disabled);
        focusOption(instance, selected >= 0 ? selected : 0);
    }

    function refreshInstance(instance) {
        const items = optionItems(instance.select);
        const selected = items.find(item => item.value === instance.select.value) || items[0];
        instance.value.textContent = selected?.label || "";
        instance.button.disabled = instance.select.disabled;
        instance.button.setAttribute("aria-label", instance.select.getAttribute("aria-label") || selected?.label || "选择选项");
        const width = Math.max(68, naturalWidth(instance.button, items));
        instance.wrapper.style.setProperty("--mask-select-width", width + "px");
        if (active === instance) close(instance);
    }

    function enhanceSelect(select) {
        if (!(select instanceof HTMLSelectElement) || select.dataset.maskSelect === "off") return null;
        const existing = instances.get(select);
        if (existing) {
            refreshInstance(existing);
            return existing;
        }
        const wrapper = document.createElement("span");
        wrapper.className = "mask-select";
        const button = document.createElement("button");
        button.className = "mask-select-button";
        button.type = "button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-expanded", "false");
        const value = document.createElement("span");
        value.className = "mask-select-value";
        const arrow = document.createElement("span");
        arrow.className = "mask-select-arrow";
        arrow.textContent = "▼";
        button.append(value, arrow);
        select.parentNode.insertBefore(wrapper, select);
        wrapper.append(select, button);
        select.classList.add("mask-select-native");
        const instance = { select, wrapper, button, value, popup: null };
        instances.set(select, instance);
        button.addEventListener("click", () => open(instance));
        button.addEventListener("keydown", event => {
            if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                open(instance);
            }
        });
        refreshInstance(instance);
        return instance;
    }

    function enhance(root = document) {
        if (root instanceof HTMLSelectElement) enhanceSelect(root);
        else root.querySelectorAll?.("select").forEach(enhanceSelect);
    }

    function refresh(target) {
        if (target instanceof HTMLSelectElement) enhanceSelect(target);
        else enhance(target || document);
    }

    document.addEventListener("pointerdown", event => {
        if (active && !active.wrapper.contains(event.target) && !active.popup.contains(event.target)) close();
    }, true);
    window.addEventListener("resize", () => close());
    window.addEventListener("scroll", event => {
        if (!active) return;
        const target = event.target;
        if (target instanceof Node && (target === active.popup || active.popup.contains(target))) return;
        close();
    }, true);

    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes" && record.target instanceof HTMLSelectElement) enhanceSelect(record.target);
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
            }
        }
    });

    window.MaskSelect = { enhance, refresh, closeAll: () => close() };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            enhance();
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
        }, { once: true });
    } else {
        enhance();
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    }
})();
