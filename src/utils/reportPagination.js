const REPORT_PAGINATION_SCRIPT = String.raw`
(() => {
  if (window.__labReportPaginationPromise) return window.__labReportPaginationPromise;

  const waitForAssets = () => Promise.race([
    Promise.all([
      document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
      ...Array.from(document.images).map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          }))
    ]),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);

  const paginate = () => {
    if (document.body.classList.contains("report-pagination-ready")) return true;
    const sources = Array.from(document.querySelectorAll(".report-pagination-source"));
    if (!sources.length) return false;

    const root = document.createElement("div");
    root.className = "report-generated-pages report-pagination-measuring";
    document.body.appendChild(root);

    let currentPage = null;
    let pageNumber = 0;
    let activeLetterhead = null;
    let activeContentClasses = [];
    const overflowTolerance = 1;

    const sourceLetterhead = (source) => {
      const logicalPage = source.closest(".multi-report-page");
      return logicalPage?.querySelector(":scope > .letterhead-background")
        || Array.from(document.body.children).find((element) => element.classList?.contains("letterhead-background"))
        || null;
    };

    const createPage = () => {
      const page = document.createElement("section");
      page.className = "report-generated-page";
      page.dataset.reportPage = String(++pageNumber);

      if (activeLetterhead) {
        const pad = activeLetterhead.cloneNode(true);
        pad.classList.remove("multi-report-print-letterhead");
        page.appendChild(pad);
      }

      const content = document.createElement("div");
      content.className = ["main-content", "report-generated-content", ...activeContentClasses].join(" ");
      page.appendChild(content);
      root.appendChild(page);
      currentPage = { page, content };
      return currentPage;
    };

    const fits = () => currentPage.content.scrollHeight <= currentPage.content.clientHeight + overflowTolerance;
    const pageHasContent = () => Array.from(currentPage.content.childNodes).some((node) => (
      node.nodeType !== Node.TEXT_NODE || node.textContent.trim()
    ));

    const appendWithWrappers = (node, wrappers) => {
      let parent = currentPage.content;
      let rootNode = null;
      wrappers.forEach((prototype) => {
        const wrapper = prototype.cloneNode(false);
        if (!rootNode) rootNode = wrapper;
        parent.appendChild(wrapper);
        parent = wrapper;
      });
      const clone = node.cloneNode(true);
      if (!rootNode) rootNode = clone;
      parent.appendChild(clone);
      return { rootNode, clone };
    };

    const tryWholeNode = (node, wrappers) => {
      const appended = appendWithWrappers(node, wrappers);
      if (fits()) return true;
      appended.rootNode.remove();
      return false;
    };

    const appendTableShell = (table, wrappers, tbodyPrototype = null) => {
      let parent = currentPage.content;
      let rootNode = null;
      wrappers.forEach((prototype) => {
        const wrapper = prototype.cloneNode(false);
        if (!rootNode) rootNode = wrapper;
        parent.appendChild(wrapper);
        parent = wrapper;
      });

      const tableClone = table.cloneNode(false);
      if (!rootNode) rootNode = tableClone;
      parent.appendChild(tableClone);
      Array.from(table.children).forEach((child) => {
        if (!["TBODY", "TFOOT"].includes(child.tagName)) tableClone.appendChild(child.cloneNode(true));
      });
      const tbody = tbodyPrototype ? tbodyPrototype.cloneNode(false) : document.createElement("tbody");
      tableClone.appendChild(tbody);
      return { rootNode, table: tableClone, tbody };
    };

    const placeTable = (table, wrappers) => {
      const bodies = Array.from(table.tBodies);
      const rowGroups = bodies.length ? bodies : [null];
      let shell = null;

      rowGroups.forEach((body) => {
        const rows = body ? Array.from(body.rows) : [];
        rows.forEach((row) => {
          if (!shell) shell = appendTableShell(table, wrappers, body);
          const rowClone = row.cloneNode(true);
          shell.tbody.appendChild(rowClone);
          if (fits()) return;

          rowClone.remove();
          if (!shell.tbody.rows.length && !pageHasContent()) {
            shell.tbody.appendChild(rowClone);
            return;
          }
          if (!shell.tbody.rows.length) shell.rootNode.remove();
          createPage();
          shell = appendTableShell(table, wrappers, body);
          shell.tbody.appendChild(rowClone);
        });
        shell = null;
      });

      const footer = table.tFoot;
      if (footer) {
        const target = currentPage.content.querySelector("table:last-of-type");
        if (target) {
          const footerClone = footer.cloneNode(true);
          target.appendChild(footerClone);
          if (!fits()) {
            footerClone.remove();
            createPage();
            const footerShell = appendTableShell(table, wrappers);
            footerShell.table.appendChild(footerClone);
          }
        }
      }
    };

    const placeText = (node, wrappers) => {
      const words = node.textContent.match(/\S+\s*/g) || [];
      let offset = 0;
      while (offset < words.length) {
        let low = 1;
        let high = words.length - offset;
        let accepted = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const probe = document.createTextNode(words.slice(offset, offset + middle).join(""));
          const appended = appendWithWrappers(probe, wrappers);
          if (fits()) {
            accepted = middle;
            appended.rootNode.remove();
            low = middle + 1;
          } else {
            appended.rootNode.remove();
            high = middle - 1;
          }
        }

        if (!accepted) {
          if (pageHasContent()) {
            createPage();
            continue;
          }
          accepted = 1;
        }
        appendWithWrappers(document.createTextNode(words.slice(offset, offset + accepted).join("")), wrappers);
        offset += accepted;
        if (offset < words.length) createPage();
      }
    };

    const placeNode = (node, wrappers = []) => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
      if (tryWholeNode(node, wrappers)) return;

      if (pageHasContent()) {
        createPage();
        if (tryWholeNode(node, wrappers)) return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        placeText(node, wrappers);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "TABLE") {
        placeTable(node, wrappers);
        return;
      }

      const children = Array.from(node.childNodes).filter((child) => (
        child.nodeType !== Node.TEXT_NODE || child.textContent.trim()
      ));
      if (!children.length) {
        appendWithWrappers(node, wrappers);
        return;
      }
      children.forEach((child) => placeNode(child, [...wrappers, node]));
    };

    sources.forEach((source) => {
      const content = source.querySelector(".main-content");
      if (!content) return;
      activeLetterhead = sourceLetterhead(source);
      activeContentClasses = Array.from(content.classList).filter((name) => name !== "main-content");
      currentPage = null;
      createPage();
      Array.from(content.childNodes).forEach((node) => placeNode(node));
    });

    root.classList.remove("report-pagination-measuring");
    document.body.classList.add("report-pagination-ready");
    return true;
  };

  window.__labReportPaginationPromise = waitForAssets()
    .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    .then(paginate);
  return window.__labReportPaginationPromise;
})()
`;

module.exports = { REPORT_PAGINATION_SCRIPT };
