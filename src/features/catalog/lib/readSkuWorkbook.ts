const MAX_FILE_BYTES = 1_048_576;
const MAX_XML_BYTES = 4_194_304;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function invalidWorkbook(): never {
  throw new Error('invalidWorkbook');
}

/** Bounded ZIP reader for the XML parts of .xlsx; no macros or external links run. */
export async function readWorkbookXml(buffer: ArrayBuffer): Promise<Map<string, string>> {
  if (buffer.byteLength > MAX_FILE_BYTES || buffer.byteLength < 22) invalidWorkbook();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
    invalidWorkbook();
  }
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (count > 200 || offset + directorySize > end) invalidWorkbook();
  const parts = new Map<string, string>();
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) invalidWorkbook();
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameSize = view.getUint16(offset + 28, true);
    const extraSize = view.getUint16(offset + 30, true);
    const commentSize = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + nameSize + extraSize + commentSize > end) invalidWorkbook();
    const name = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + nameSize));
    offset += 46 + nameSize + extraSize + commentSize;
    if ((flags & 1) !== 0 || size > MAX_XML_BYTES || localOffset + 30 > end) invalidWorkbook();
    if (
      !/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
        name,
      )
    ) {
      continue;
    }
    expanded += size;
    if (
      expanded > MAX_XML_BYTES ||
      parts.has(name) ||
      view.getUint32(localOffset, true) !== 0x04034b50
    ) {
      invalidWorkbook();
    }
    const start =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (start + compressedSize > end) invalidWorkbook();
    const compressed = bytes.slice(start, start + compressedSize);
    let output: Uint8Array;
    if (method === 0) output = compressed;
    else if (method === 8) {
      const reader = new Blob([compressed])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          length += result.value.length;
          if (length > size || length > MAX_XML_BYTES) invalidWorkbook();
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel();
      }
      output = new Uint8Array(length);
      let position = 0;
      for (const chunk of chunks) {
        output.set(chunk, position);
        position += chunk.length;
      }
    } else invalidWorkbook();
    if (output.length !== size) invalidWorkbook();
    parts.set(name, textDecoder.decode(output));
  }
  return parts;
}

function xml(source: string | undefined): Document {
  if (!source || /<!DOCTYPE|<!ENTITY/i.test(source)) invalidWorkbook();
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) invalidWorkbook();
  return document;
}

const NUMERIC_COLUMNS = new Set([
  'weightG',
  'lengthCm',
  'widthCm',
  'heightCm',
  'declaredValue',
  'shelfLifeDays',
  'minInboundShelfLifePct',
  'minOutboundDays',
  'nearExpiryDays',
]);
const BOOLEAN_COLUMNS = new Set(['isActive', 'trackLot', 'trackExpiry']);
const ALLOWED_COLUMNS = new Set([
  'sku',
  'name',
  'barcode',
  'declaredCostVnd',
  ...NUMERIC_COLUMNS,
  ...BOOLEAN_COLUMNS,
]);
const REQUIRED_COLUMNS = [
  'sku',
  'name',
  'weightG',
  'lengthCm',
  'widthCm',
  'heightCm',
  'declaredValue',
];

export function skuRowsFromCells(rows: readonly (readonly string[])[]): Record<string, unknown>[] {
  const headers = rows[0]?.map((header) => header.trim()) ?? [];
  if (
    REQUIRED_COLUMNS.some((header) => !headers.includes(header)) ||
    new Set(headers).size !== headers.length ||
    headers.some((header) => !ALLOWED_COLUMNS.has(header))
  ) {
    throw new Error('invalidHeaders');
  }
  const data = rows.slice(1).filter((row) => row.some((value) => value.trim() !== ''));
  if (data.length < 1 || data.length > 100) throw new Error('invalidRowCount');
  return data.map((row) =>
    Object.fromEntries(
      headers.flatMap<[string, unknown]>((header, index) => {
        const value = (row[index] ?? '').trim();
        if (value === '' && !REQUIRED_COLUMNS.includes(header)) return [];
        if (NUMERIC_COLUMNS.has(header)) return [[header, value === '' ? null : Number(value)]];
        if (BOOLEAN_COLUMNS.has(header)) {
          return [
            [
              header,
              value === 'true' || value === '1'
                ? true
                : value === 'false' || value === '0'
                  ? false
                  : value,
            ],
          ];
        }
        return [[header, value]];
      }),
    ),
  );
}

export async function readSkuWorkbook(file: File): Promise<Record<string, unknown>[]> {
  if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > MAX_FILE_BYTES) invalidWorkbook();
  const parts = await readWorkbookXml(await file.arrayBuffer());
  const workbook = xml(parts.get('xl/workbook.xml'));
  const sheet = workbook.getElementsByTagNameNS('*', 'sheet')[0];
  const relationId = sheet?.getAttributeNS(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'id',
  );
  const relations = xml(parts.get('xl/_rels/workbook.xml.rels'));
  const relation = Array.from(relations.getElementsByTagNameNS('*', 'Relationship')).find(
    (item) => item.getAttribute('Id') === relationId,
  );
  const target = relation?.getAttribute('Target');
  if (!target || relation?.getAttribute('TargetMode') === 'External') invalidWorkbook();
  const path = new URL(target, 'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1);
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) invalidWorkbook();
  const shared = parts.has('xl/sharedStrings.xml')
    ? Array.from(xml(parts.get('xl/sharedStrings.xml')).getElementsByTagNameNS('*', 'si')).map(
        (item) =>
          Array.from(item.getElementsByTagNameNS('*', 't'))
            .map((text) => text.textContent ?? '')
            .join(''),
      )
    : [];
  const sheetDocument = xml(parts.get(path));
  const cells: string[][] = [];
  for (const row of Array.from(sheetDocument.getElementsByTagNameNS('*', 'row'))) {
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagNameNS('*', 'c'))) {
      if (cell.getElementsByTagNameNS('*', 'f').length) throw new Error('formulaCells');
      const reference = cell.getAttribute('r')?.match(/^([A-Z]+)\d+$/)?.[1];
      if (!reference) invalidWorkbook();
      let column = 0;
      for (const letter of reference) column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > 20) invalidWorkbook();
      const value = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
      const type = cell.getAttribute('t');
      values[column - 1] =
        type === 's'
          ? (shared[Number(value)] ?? invalidWorkbook())
          : type === 'inlineStr'
            ? Array.from(cell.getElementsByTagNameNS('*', 't'))
                .map((text) => text.textContent ?? '')
                .join('')
            : value;
    }
    cells.push(Array.from({ length: values.length }, (_, index) => values[index] ?? ''));
  }
  return skuRowsFromCells(cells);
}
