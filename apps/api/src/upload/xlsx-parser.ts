import * as XLSX from 'xlsx';

/**
 * xlsx/csv 파서 스텁 — PRD §3.3 PARSE 단계.
 * 시트의 헤더 1행 + 데이터 N행을 무손실로 RawRow 형태(rowIndex + raw셀맵)로 추출한다.
 * 본격적인 인코딩 감지/병합셀/매핑은 후속 주차(W2)에서 보강. 여기서는 동작하는 시임을 둔다.
 */

export interface ParsedRow {
  rowIndex: number; // 1-base 원본 행 번호(헤더 제외 데이터 행 기준)
  raw: Record<string, string>; // 원본 헤더 → 셀 문자열
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: ParsedRow[];
}

/** 파일 버퍼 → 첫 시트(또는 가장 행 많은 시트) 파싱. */
export function parseWorkbook(buffer: Buffer): ParsedSheet {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    return { sheetName: '', headers: [], rows: [] };
  }

  // 가장 행이 많은 시트를 데이터 시트로 선택(합계/안내 시트 회피).
  let best: { name: string; matrix: string[][] } | null = null;
  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    });
    if (!best || matrix.length > best.matrix.length) {
      best = { name, matrix };
    }
  }
  if (!best || best.matrix.length === 0) {
    return { sheetName: sheetNames[0] ?? '', headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = best.matrix;
  const headers = (headerRow ?? []).map((h) => String(h ?? '').trim());

  const rows: ParsedRow[] = dataRows.map((cells, i) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, c) => {
      if (h) raw[h] = String(cells[c] ?? '').trim();
    });
    return { rowIndex: i + 1, raw };
  });

  return { sheetName: best.name, headers, rows };
}

export function detectSheets(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return wb.SheetNames;
}
