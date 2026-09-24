import { parseHTML } from "linkedom";

export function register({ assert, loadModule, test }) {
  test("table scrolling renders incoming rows without rebuilding retained rows or all row keys", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML(
      "<html><body><div id='scroll'><div id='root'></div></div></body></html>",
    );
    const elementPrototype = window.HTMLElement.prototype;
    const savedHeight = Object.getOwnPropertyDescriptor(elementPrototype, "offsetHeight");
    const savedWidth = Object.getOwnPropertyDescriptor(elementPrototype, "offsetWidth");
    const scroll = document.getElementById("scroll");
    Object.assign(globalThis, {
      window,
      document,
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    window.getComputedStyle = (element) => ({ overflowY: element === scroll ? "auto" : "visible" });
    Object.defineProperties(window.HTMLElement.prototype, {
      offsetHeight: {
        configurable: true,
        get() {
          return this === scroll ? 320 : 32;
        },
      },
      offsetWidth: {
        configurable: true,
        get() {
          return 800;
        },
      },
    });
    Object.assign(scroll, { clientHeight: 320, scrollHeight: 320000, scrollTop: 0, scrollTo() {} });
    let table;
    try {
      const { mountScrollTable } = await loadModule(
        "/apps/web/test/support/fixtures/database-table-scroll.tsx",
      );
      table = mountScrollTable(document.getElementById("root"), 10000);
      const mounted = () =>
        [...document.querySelectorAll("tr[data-index]")].map((row) => Number(row.dataset.index));
      const retained = mounted();
      table.reset();
      const initialRangeNotifications = table.getRenderedRangeNotifications();
      scroll.scrollTop = 32;
      scroll.dispatchEvent(new window.Event("scroll"));
      assert.ok(mounted().includes(10), "incoming visible row must be committed during scrolling");
      assert.ok(
        table.getRenderedRangeNotifications() > initialRangeNotifications,
        "virtual range changes must notify row-layout owners",
      );
      const repeated = retained.filter((index) => table.renders.has(index));
      assert.equal(repeated.length, 0, `scroll rebuilt ${repeated.length} retained rows`);
      assert.ok(table.getKeyReads() < 200, `scroll visited ${table.getKeyReads()} row keys`);
      for (const offset of [3200, 32000, 16000, 64]) {
        scroll.scrollTop = offset;
        scroll.dispatchEvent(new window.Event("scroll"));
        const indexes = mounted();
        for (let index = offset / 32; index < offset / 32 + 10; index++) {
          assert.ok(indexes.includes(index), `missing visible row ${index} while scrolling`);
        }
        assert.ok(indexes.length < 100, "mounted rows must stay bounded");
      }
      table.update();
      assert.equal(document.querySelector('tr[data-index="2"]').textContent, "Updated page-2");
      table.activate("page-2:name");
      scroll.scrollTop = 32000;
      scroll.dispatchEvent(new window.Event("scroll"));
      assert.ok(mounted().includes(2), "active row must remain mounted away from the viewport");
      table.activate(null);
      assert.ok(!mounted().includes(2), "inactive offscreen row should be released");
      table.reverse();
      assert.equal(
        document.querySelector('tr[data-index="1000"]').textContent,
        "Reversed page-8999",
      );
    } finally {
      // Let the virtualizer's scroll-end timer drain before restoring the DOM.
      await new Promise((resolve) => setTimeout(resolve, 170));
      table?.unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const [name, descriptor] of [
        ["offsetHeight", savedHeight],
        ["offsetWidth", savedWidth],
      ]) {
        if (descriptor) Object.defineProperty(elementPrototype, name, descriptor);
        else delete elementPrototype[name];
      }
      for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (!saved[key]) delete globalThis[key];
      }
      Object.defineProperties(globalThis, saved);
    }
  });
}
