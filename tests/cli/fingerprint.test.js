'use strict';

const { fingerprint } = require('../../lib/fingerprint');

describe('lib/fingerprint', () => {
  test('同内容不同行尾（CRLF/LF）→ 同指纹', () => {
    expect(fingerprint('line1\r\nline2\r\n')).toBe(fingerprint('line1\nline2\n'));
  });

  test('不同内容 → 不同指纹', () => {
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });

  test('指纹是 64 位 hex（sha256）', () => {
    expect(fingerprint('anything')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('Buffer 与等价 string 同指纹', () => {
    expect(fingerprint(Buffer.from('hello\nworld'))).toBe(fingerprint('hello\nworld'));
  });

  test('确定性：同输入多次调用稳定', () => {
    const c = 'export class X {}\n';
    expect(fingerprint(c)).toBe(fingerprint(c));
  });
});
