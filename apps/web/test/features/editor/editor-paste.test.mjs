import { parseHTML } from "linkedom"

function installDomParser() {
  globalThis.DOMParser = class DOMParser {
    parseFromString(html, type) {
      if (type !== "text/html") {
        throw new Error(`Unsupported DOMParser type: ${type}`)
      }

      return parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`)
        .document
    }
  }
}

export function register({ assert, loadModule, test }) {
  test("normalizePastedEditorHTML converts single-row tables into column blocks", async () => {
    installDomParser()
    const { normalizePastedEditorHTML } = await loadModule("/src/editor/paste.ts")

    const html = `
      <table>
        <tbody>
          <tr>
            <td><p>Left</p></td>
            <td><p>Right</p></td>
          </tr>
        </tbody>
      </table>
    `

    const normalized = normalizePastedEditorHTML(html)

    assert.match(normalized, /data-type="columnBlock"/)
    assert.match(normalized, /data-column-count="2"/)
    assert.match(normalized, />Left</)
    assert.match(normalized, />Right</)
  })

  test("normalizePastedEditorHTML leaves multi-row data tables unchanged", async () => {
    installDomParser()
    const { normalizePastedEditorHTML } = await loadModule("/src/editor/paste.ts")

    const html = `
      <table>
        <tbody>
          <tr><td><p>Row 1</p></td></tr>
          <tr><td><p>Row 2</p></td></tr>
        </tbody>
      </table>
    `

    assert.equal(normalizePastedEditorHTML(html), html)
  })
}