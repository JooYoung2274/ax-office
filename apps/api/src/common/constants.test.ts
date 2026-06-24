import test from 'node:test';
import assert from 'node:assert/strict';
import { bullJobId } from './constants';

/**
 * 회귀: BullMQ 커스텀 jobId는 ':'를 포함할 수 없다("Custom Id cannot contain :").
 * Prisma cuid는 ':'를 안 쓰지만, 과거 `${name}:${id}` 패턴이 런타임 500을 유발했다.
 * bullJobId는 어떤 입력이 와도 ':'를 제거해 안전한 멱등 jobId를 만든다.
 */
test('jobId에 콜론이 들어가지 않는다', () => {
  assert.equal(bullJobId('parse', 'abc123'), 'parse-abc123');
  assert.ok(!bullJobId('calc', 'a:b:c').includes(':'));
  assert.equal(bullJobId('calc', 'a:b:c'), 'calc-a-b-c');
});

test('결정론: 같은 입력 → 같은 jobId(멱등)', () => {
  assert.equal(bullJobId('report', 'r1'), bullJobId('report', 'r1'));
});
