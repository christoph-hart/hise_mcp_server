/**
 * Convert the subset of Nuxt MDC used by the website documentation into
 * ordinary Markdown. The parser is deliberately line-oriented so fenced code
 * blocks and nested directives are not damaged by broad regular expressions.
 */

/** @param {string} value */
function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** @param {string} source */
function parseAttributes(source = '') {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const match of source.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

/** @param {string} source */
function parseInlineRecord(source) {
  /** @type {Record<string, string>} */
  const record = {};
  const body = source.replace(/^\s*[-]?\s*\{/, '').replace(/}\s*$/, '');
  for (const match of body.matchAll(/([\w-]+):\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/g)) {
    record[match[1]] = unquote(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return record;
}

/** @param {string} yaml */
function inlineRecords(yaml) {
  return [...yaml.matchAll(/\{[^{}]*}/g)].map(match => parseInlineRecord(match[0]));
}

/** Parse the simple list-of-maps shape used by common-mistakes. @param {string} yaml */
function blockRecords(yaml) {
  /** @type {Record<string, string>[]} */
  const records = [];
  /** @type {Record<string, string> | null} */
  let current = null;
  for (const line of yaml.split('\n')) {
    const item = line.match(/^\s*-\s+([\w-]+):\s*(.*)$/);
    const field = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (item) {
      if (current) records.push(current);
      current = { [item[1]]: unquote(item[2]) };
    } else if (field && current) {
      current[field[1]] = unquote(field[2]);
    }
  }
  if (current) records.push(current);
  return records;
}

/** @param {string[]} lines */
function splitDirectiveBody(lines) {
  if (lines[0]?.trim() !== '---') return { yaml: '', markdown: lines.join('\n').trim() };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return { yaml: '', markdown: lines.join('\n').trim() };
  return {
    yaml: lines.slice(1, end).join('\n'),
    markdown: lines.slice(end + 1).join('\n').trim(),
  };
}

/** @param {string} text @param {string} prefix */
function quoteBlock(text, prefix) {
  const heading = prefix ? `**${prefix}**` : '';
  return [heading, text].filter(Boolean).join('\n\n').split('\n').map(line => `> ${line}`.trimEnd()).join('\n');
}

/** @param {Record<string, string>[]} records @param {string} label */
function renderTable(records, label) {
  if (!records.length) return '';
  const preferred = label === 'Modulation Chains'
    ? ['name', 'desc', 'scope', 'constrainer']
    : ['name', 'desc', 'range', 'default'];
  const columns = preferred.filter(key => records.some(record => record[key]));
  if (!columns.length) return '';
  /** @type {Record<string, string>} */
  const names = { name: 'Name', desc: 'Description', range: 'Range', default: 'Default', scope: 'Scope', constrainer: 'Constrainer' };
  const escape = (value = '') => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = [
    `| ${columns.map(column => names[column] || column).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...records.map(record => `| ${columns.map(column => escape(record[column])).join(' | ')} |`),
  ];
  return `### ${label}\n\n${rows.join('\n')}`;
}

/** @param {string} name @param {Record<string, string>} attributes @param {string[]} rawLines */
function renderDirective(name, attributes, rawLines) {
  const { yaml, markdown } = splitDirectiveBody(rawLines);
  const renderedInner = markdown ? sanitizeMarkdown(markdown) : '';

  if (name === 'warning' || name === 'tip') {
    const kind = name === 'warning' ? 'Warning' : 'Tip';
    const label = attributes.title ? `${kind} — ${attributes.title}` : kind;
    return quoteBlock(renderedInner, label);
  }

  if (name === 'see-also') {
    const records = inlineRecords(yaml);
    if (!records.length) return renderedInner;
    const links = records.map(record => {
      const label = record.label || record.to || 'Related documentation';
      const link = record.to ? `[${label}](${record.to})` : label;
      return `- ${link}${record.desc ? ` — ${record.desc}` : ''}`;
    });
    return `### See Also\n\n${links.join('\n')}`;
  }

  if (name === 'common-mistakes') {
    const records = blockRecords(yaml);
    if (!records.length) return renderedInner;
    const mistakes = records.map(record => [
      `- **${record.title || 'Common mistake'}**`,
      record.wrong ? `  - **Problem:** ${record.wrong}` : '',
      record.right ? `  - **Solution:** ${record.right}` : '',
      record.reason || record.explanation ? `  - **Why:** ${record.reason || record.explanation}` : '',
    ].filter(Boolean).join('\n'));
    return `### Common Mistakes\n\n${mistakes.join('\n')}`;
  }

  if (name === 'parameter-table') return renderTable(inlineRecords(yaml), 'Parameters');
  if (name === 'modulation-table') return renderTable(inlineRecords(yaml), 'Modulation Chains');

  if (name === 'signal-path') {
    const descriptions = [];
    const records = blockRecords(yaml).filter(record => record.desc);
    for (const record of records) {
      descriptions.push(`- **${record.name || record.title || 'Value'}:** ${record.desc}`);
    }
    return ['### Signal Path', descriptions.join('\n'), renderedInner].filter(Boolean).join('\n\n');
  }

  if (name === 'scriptnode-example') {
    const node = yaml.match(/^node:\s*(.+)$/m)?.[1];
    const dataUrl = yaml.match(/^dataUrl:\s*(.+)$/m)?.[1];
    const cleanNode = node ? unquote(node) : '';
    const cleanUrl = dataUrl ? unquote(dataUrl) : '';
    const value = cleanNode ? `\`${cleanNode}\`` : 'Scriptnode network';
    return `**Example network:** ${cleanUrl ? `[${value}](${cleanUrl})` : value}`;
  }

  if (name === 'filter-response') {
    const defaults = [...yaml.matchAll(/^\s+-\s+(.+)$/gm)].map(match => `\`${unquote(match[1])}\``);
    return defaults.length ? `**Filter response presets:** ${defaults.join(', ')}` : '';
  }

  if (name === 'category-tags') return '';

  if (name === 'Card') {
    const label = attributes.title || 'Documentation';
    const link = attributes.to ? `[${label}](${attributes.to})` : label;
    return `- **${link}**${renderedInner ? ` — ${renderedInner.replace(/\n+/g, ' ')}` : ''}`;
  }

  if (name === 'CardGroup' || name === 'selection') return renderedInner;

  // Unknown visual components should not make their useful prose disappear.
  return renderedInner;
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {boolean} stopAtClose
 * @returns {{ text: string, next: number }}
 */
function sanitizeLines(lines, start, stopAtClose) {
  const output = [];
  let index = start;
  let fence = '';

  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fence[0] === fenceMatch[1][0] && fenceMatch[1].length >= fence.length) fence = '';
      output.push(line);
      index++;
      continue;
    }

    if (!fence && line.trim() === '::' && stopAtClose) {
      return { text: output.join('\n').trim(), next: index + 1 };
    }

    const directive = !fence ? line.match(/^\s*::([A-Za-z][\w-]*)(?:\{(.*)\})?\s*$/) : null;
    if (directive) {
      const nested = sanitizeLines(lines, index + 1, true);
      const rendered = renderDirective(directive[1], parseAttributes(directive[2] || ''), nested.text.split('\n'));
      if (rendered) output.push(rendered);
      index = nested.next;
      continue;
    }

    output.push(line);
    index++;
  }

  return { text: output.join('\n').trim(), next: index };
}

/** @param {string} markdown */
export function sanitizeMarkdown(markdown) {
  return sanitizeLines(markdown.replace(/\r\n/g, '\n').split('\n'), 0, false).text
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}
