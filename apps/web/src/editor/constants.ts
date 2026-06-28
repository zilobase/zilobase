export const starterContent = `
  <h1>Draft your next page doc</h1>
  <p>
    Type <code>/</code> on a new line to open the block menu. Use Markdown-style
    shortcuts, checklists, quotes, code blocks, and rich inline formatting.
  </p>
  <ul data-type="taskList">
    <li data-type="taskItem" data-checked="false">Capture the idea</li>
    <li data-type="taskItem" data-checked="true">Shape it into a clean doc</li>
  </ul>
  <blockquote>Fast notes, structured blocks, zero ceremony.</blockquote>
`

export const emptyContent = "<p></p>"

export const pastedBlockElementSelector = [
  "address", "article", "aside", "blockquote", "details", "div", "dl",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "table", "ul",
].join(",")