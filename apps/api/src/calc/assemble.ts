import type { RawDataset, RawRow } from '@axaxax/calc-engine';

/**
 * 기간 내 여러 업로드 배치(각 1 데이터셋)를 calc-engine 입력용 RawDataset[]로 병합.
 * cash CRO는 계좌마스터+거래내역+스케줄 3종이 한 번에 필요하므로,
 * 동일 (tenant, domain, period)의 매핑 완료 배치들을 kind별로 합친다(PRD §3.6, W2).
 */
export interface BatchRows {
  kind: string;
  rows: RawRow[];
}

/** kind별로 행을 병합. kind 순서는 정렬(결정론). 입력 내 행 순서는 보존. */
export function assembleDatasets(batches: BatchRows[]): RawDataset[] {
  const byKind = new Map<string, RawRow[]>();
  for (const b of batches) {
    const arr = byKind.get(b.kind) ?? [];
    arr.push(...b.rows);
    byKind.set(b.kind, arr);
  }
  return [...byKind.keys()]
    .sort()
    .map((kind) => ({ kind, rows: byKind.get(kind)! }));
}
