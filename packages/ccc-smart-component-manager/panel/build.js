'use strict';

/**
 * Build script for panel/index.js
 *
 * Assembles styles.css, template.html, and logic.js into the final
 * panel/index.js file that Cocos Creator's Editor.Panel.extend() expects.
 *
 * Usage: node panel/build.js
 */

const fs = require('fs');
const path = require('path');

const PANEL_DIR = __dirname;

// Source files
const STYLES_FILE = path.join(PANEL_DIR, 'styles.css');
const TEMPLATE_FILE = path.join(PANEL_DIR, 'template.html');
const LOGIC_FILE = path.join(PANEL_DIR, 'logic.js');

// Output file
const OUTPUT_FILE = path.join(PANEL_DIR, 'index.js');

function build() {
  // Read source files
  let cssContent, htmlContent, logicSource;

  try {
    cssContent = fs.readFileSync(STYLES_FILE, 'utf8');
  } catch (err) {
    console.error(`Failed to read ${STYLES_FILE}: ${err.message}`);
    process.exit(1);
  }

  try {
    htmlContent = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  } catch (err) {
    console.error(`Failed to read ${TEMPLATE_FILE}: ${err.message}`);
    process.exit(1);
  }

  try {
    logicSource = fs.readFileSync(LOGIC_FILE, 'utf8');
  } catch (err) {
    console.error(`Failed to read ${LOGIC_FILE}: ${err.message}`);
    process.exit(1);
  }

  // Strip the comment header from CSS (first line if it's a comment)
  cssContent = stripHeaderComment(cssContent, '/*');

  // Strip the comment header from HTML (first line if it's a comment)
  htmlContent = stripHeaderComment(htmlContent, '<!--');

  // Escape backticks and ${} in CSS/HTML content for template literal embedding
  const escapedCss = escapeForTemplateLiteral(cssContent);
  const escapedHtml = escapeForTemplateLiteral(htmlContent);

  // Parse logic.js to extract require statements and the exported object
  const { requires, objectBody } = parseLogicFile(logicSource);

  // Assemble the final output
  const indent = '    ';
  const indentedCss = escapedCss
    .split('\n')
    .map(line => line.length > 0 ? indent + line : line)
    .join('\n');

  const indentedHtml = escapedHtml
    .split('\n')
    .map(line => line.length > 0 ? indent + line : line)
    .join('\n');

  const output = `

// panel/index.js, this filename needs to match the one registered in package.json

${requires}

Editor.Panel.extend({
  // css style for panel - 现代化设计
  style: \`
${indentedCss}
  \`,

  // html template for panel
  template: \`
${indentedHtml}
  \`,

${objectBody}
});
`;

  // Write output
  try {
    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    console.log(`Built successfully: ${OUTPUT_FILE}`);
    console.log(`  CSS:      ${cssContent.split('\n').length} lines from styles.css`);
    console.log(`  HTML:     ${htmlContent.split('\n').length} lines from template.html`);
    console.log(`  JS logic: ${logicSource.split('\n').length} lines from logic.js`);
    console.log(`  Output:   ${output.split('\n').length} lines total`);
  } catch (err) {
    console.error(`Failed to write ${OUTPUT_FILE}: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Strip header comment from file content (first comment block only)
 */
function stripHeaderComment(content, commentStart) {
  const lines = content.split('\n');
  let startIdx = 0;

  // Skip leading empty lines
  while (startIdx < lines.length && lines[startIdx].trim() === '') {
    startIdx++;
  }

  if (commentStart === '/*') {
    // Strip /* ... */ block comment at the start
    if (startIdx < lines.length && lines[startIdx].trim().startsWith('/*')) {
      let endIdx = startIdx;
      while (endIdx < lines.length && !lines[endIdx].includes('*/')) {
        endIdx++;
      }
      // Skip the closing */ line and any following empty line
      endIdx++;
      while (endIdx < lines.length && lines[endIdx].trim() === '') {
        endIdx++;
      }
      return lines.slice(endIdx).join('\n');
    }
  } else if (commentStart === '<!--') {
    // Strip <!-- ... --> comment at the start
    if (startIdx < lines.length && lines[startIdx].trim().startsWith('<!--')) {
      let endIdx = startIdx;
      while (endIdx < lines.length && !lines[endIdx].includes('-->')) {
        endIdx++;
      }
      // Skip the closing --> line and any following empty line
      endIdx++;
      while (endIdx < lines.length && lines[endIdx].trim() === '') {
        endIdx++;
      }
      return lines.slice(endIdx).join('\n');
    }
  }

  return content;
}

/**
 * Escape content for embedding in a JavaScript template literal.
 * Escapes backticks and ${ sequences.
 */
function escapeForTemplateLiteral(content) {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

/**
 * Parse logic.js to extract:
 * - require statements (top-level code before module.exports)
 * - the object body inside module.exports = { ... }
 */
function parseLogicFile(source) {
  const lines = source.split('\n');

  // Find the module.exports = { line
  let exportsLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^module\.exports\s*=\s*\{/)) {
      exportsLineIdx = i;
      break;
    }
  }

  if (exportsLineIdx === -1) {
    console.error('Could not find module.exports = { in logic.js');
    process.exit(1);
  }

  // Everything before module.exports is require statements / top-level code
  // Skip 'use strict' and comment headers
  let requireLines = [];
  for (let i = 0; i < exportsLineIdx; i++) {
    const trimmed = lines[i].trim();
    // Skip 'use strict', empty lines, and the extraction comment block
    if (trimmed === "'use strict';" || trimmed === '"use strict";') continue;
    if (trimmed === '') continue;
    if (trimmed.startsWith('// Extracted from') || trimmed.startsWith('// This file') || trimmed.startsWith('// Use `node')) continue;
    requireLines.push(lines[i]);
  }

  const requires = requireLines.join('\n');

  // Find the closing }; of module.exports
  // We need to find the matching closing brace at the same nesting level
  let braceDepth = 0;
  let closingLineIdx = -1;
  for (let i = exportsLineIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          closingLineIdx = i;
          break;
        }
      }
    }
    if (closingLineIdx !== -1) break;
  }

  if (closingLineIdx === -1) {
    console.error('Could not find closing }; of module.exports in logic.js');
    process.exit(1);
  }

  // Extract the object body (everything between the opening { and closing })
  // The first line after module.exports = { and before the closing };
  const bodyLines = lines.slice(exportsLineIdx + 1, closingLineIdx);
  const objectBody = bodyLines.join('\n');

  return { requires, objectBody };
}

// Run the build
build();
