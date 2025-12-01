// Theme (sáng/tối)
(function () {
    const saved = localStorage.getItem("theme");
    const html = document.documentElement;
    if (saved) html.setAttribute("data-theme", saved);

    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.addEventListener("click", () => {
            const cur = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
            html.setAttribute("data-theme", cur);
            localStorage.setItem("theme", cur);
        });
    }
})();

// Toast helper
window.toast = (msg, ms = 2600) => {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), ms);
};
