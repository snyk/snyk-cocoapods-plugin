import * as path from 'path';

import * as subProcess from '../../lib/sub-process';

const PRINT_ENV = path.join(__dirname, '..', 'fixtures', 'print-env.js');

describe('execute()', () => {
  test('Resolves when the command succeeds', async () => {
    await expect(
      subProcess.execute('sh', [
        '-c',
        'echo "success" && echo "ignore" >&2 && true',
      ]),
    ).resolves.toEqual('success\n');
  });

  test('Resolves with stderr when the command succeeds and there is no stdout', async () => {
    await expect(
      subProcess.execute('sh', ['-c', 'echo "warn" >&2 && true']),
    ).resolves.toMatch('warn\n');
  });

  test('Rejects with stdout when the command fails', async () => {
    await expect(
      subProcess.execute('sh', [
        '-c',
        'echo "error msg" && echo "ignore" >&2 && false',
      ]),
    ).rejects.toThrow('error msg\n');
  });

  test('Rejects with stderr when the command fails and there is no stdout', async () => {
    await expect(
      subProcess.execute('sh', ['-c', 'echo "error msg" >&2 && false']),
    ).rejects.toThrow('error msg\n');
  });

  test('Considers option.cwd', async () => {
    await expect(
      subProcess.execute('sh', ['-c', 'basename $PWD'], { cwd: __dirname }),
    ).resolves.toEqual('lib\n');
  });

  test('Passes arguments', async () => {
    await expect(subProcess.execute('seq', ['2'])).resolves.toEqual('1\n2\n');
  });
});

describe('child process environment', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('the child gets no SNYK_* variables', async () => {
    process.env = { ...originalEnv, SNYK_TOKEN: 'test-token' };
    process.env['snyk_debug'] = '1';

    const child = JSON.parse(await subProcess.execute('node', [PRINT_ENV]));

    expect(child.snykKeys).toEqual([]);
  });
});
