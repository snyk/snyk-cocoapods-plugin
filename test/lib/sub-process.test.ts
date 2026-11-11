import * as childProcess from 'child_process';
import * as path from 'path';

import * as subProcess from '../../lib/sub-process';

const PRINT_ENV = path.join(__dirname, '..', 'fixtures', 'print-env.js');

const TEST_ENV: Record<string, string> = {
  SNYK_TOKEN: 'test-token',
  SNYK_OAUTH_TOKEN: 'test-oauth-token',
  // eslint-disable-next-line @typescript-eslint/camelcase
  snyk_cfg_api: 'test-cfg-api',
  HTTP_PROXY: 'http://internal:1',
  SNYK_SYSTEM_HTTP_PROXY: 'http://corp:3128',
  UNRELATED_VAR: 'keep',
};
const isSnykKey = (key: string): boolean => /^snyk_/i.test(key);
const hasPath = (keys: string[]): boolean =>
  keys.some((key) => key.toUpperCase() === 'PATH');

let saved: Record<string, string | undefined> = {};

describe('execute() child environment', () => {
  beforeEach(() => {
    saved = {};
    for (const [key, value] of Object.entries(TEST_ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('passes spawn an env without SNYK_* variables and with the user proxy', async () => {
    const spy = jest.spyOn(childProcess, 'spawn');
    await subProcess.execute(process.execPath, [PRINT_ENV]);
    const env = (spy.mock.calls[0][2] as childProcess.SpawnOptions)?.env;
    expect(env).toBeDefined();
    expect(Object.keys(env!).filter(isSnykKey)).toEqual([]);
    expect(env!.HTTP_PROXY).toBe('http://corp:3128');
    expect(env!.http_proxy).toBe('http://corp:3128');
    expect(env!.UNRELATED_VAR).toBe('keep');
    expect(hasPath(Object.keys(env!))).toBe(true);
  });

  it('the child process sees no SNYK_* variables and gets the user proxy', async () => {
    const child = JSON.parse(
      await subProcess.execute(process.execPath, [PRINT_ENV]),
    );
    expect(child.keys.filter(isSnykKey)).toEqual([]);
    expect(child.HTTP_PROXY).toBe('http://corp:3128');
    expect(child.http_proxy).toBe('http://corp:3128');
    expect(child.UNRELATED_VAR).toBe('keep');
    expect(hasPath(child.keys)).toBe(true);
  });

  it('does not modify process.env', async () => {
    await subProcess.execute(process.execPath, [PRINT_ENV]);
    expect(process.env.SNYK_TOKEN).toBe('test-token');
    expect(process.env.HTTP_PROXY).toBe('http://internal:1');
  });
});

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
