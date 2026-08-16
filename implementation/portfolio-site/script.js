(() => {
  document.documentElement.classList.add("reveal-ready");

  const header = document.querySelector("[data-header]");
  const menuButton = document.querySelector("[data-menu-button]");
  const nav = document.querySelector("[data-nav]");
  const main = document.querySelector("main");
  const footer = document.querySelector("footer");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const updateHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const closeMenu = (restoreFocus = false) => {
    if (!menuButton || !nav) return;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "メニューを開く");
    nav.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    if (main) main.inert = false;
    if (footer) footer.inert = false;
    if (restoreFocus) menuButton.focus();
  };

  menuButton?.addEventListener("click", () => {
    if (!nav) return;
    const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
    if (!willOpen) {
      closeMenu(true);
      return;
    }

    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "メニューを閉じる");
    nav.classList.add("is-open");
    document.body.classList.add("menu-open");
    if (main) main.inert = true;
    if (footer) footer.inert = true;
    requestAnimationFrame(() => nav.querySelector("a")?.focus());
  });

  nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu(false)));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu(true);

    if (event.key === "Tab" && menuButton?.getAttribute("aria-expanded") === "true" && nav) {
      const menuLinks = [...nav.querySelectorAll("a")];
      const firstItem = menuLinks[0];
      const lastItem = menuButton;

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const revealItems = [...document.querySelectorAll(".reveal")];

  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.12 },
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min((index % 4) * 45, 135)}ms`;
      revealObserver.observe(item);
    });
  }

  const demo = document.querySelector("[data-product-demo]");

  if (demo) {
    const tabs = [...demo.querySelectorAll("[data-demo-tab]")];
    const panels = [...demo.querySelectorAll("[data-demo-panel]")];

    const activateTab = (tab, moveFocus = false) => {
      const target = tab.dataset.demoTab;

      tabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute("aria-selected", String(selected));
        candidate.tabIndex = selected ? 0 : -1;
      });

      panels.forEach((panel) => {
        const active = panel.dataset.demoPanel === target;
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      });

      if (moveFocus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();

        let nextIndex = index;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;

        activateTab(tabs[nextIndex], true);
      });
    });

    const initialTab = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") || tabs[0];
    if (initialTab) activateTab(initialTab);
  }

  const hero = document.querySelector(".hero");
  const dashboard = document.querySelector(".dashboard-window");
  const stageLetter = document.querySelector(".stage-letter");

  if (hero && dashboard && stageLetter && !reduceMotion.matches) {
    hero.addEventListener("pointermove", (event) => {
      if (window.innerWidth <= 1024) return;
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      dashboard.style.transform = `perspective(1200px) rotateY(${-4 + x * 2.2}deg) rotateX(${1.5 - y * 1.8}deg) translate3d(${x * 4}px, ${y * 4}px, 0)`;
      stageLetter.style.transform = `translate3d(${x * -9}px, ${y * -9}px, 0)`;
    });

    hero.addEventListener("pointerleave", () => {
      dashboard.style.transform = "";
      stageLetter.style.transform = "";
    });
  }

  const sections = [...document.querySelectorAll("main section[id]")];
  const navLinks = nav ? [...nav.querySelectorAll("a[href^='#']")] : [];

  if (sections.length && navLinks.length && "IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        navLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${visible.target.id}`;
          link.toggleAttribute("aria-current", active);
        });
      },
      { rootMargin: "-30% 0px -55%", threshold: [0, 0.25, 0.5] },
    );

    sections.forEach((section) => sectionObserver.observe(section));
  }
})();
