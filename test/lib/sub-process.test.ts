import * as subProcess from '../../lib/sub-process';

describe('execute()', () => {
  test('Resolves when the command succeeds', async () => {
    await expect(
      subProcess.execute('echo "success" && echo "ignore" >&2 && true'),
    ).resolves.toEqual('success\n');
  });

  test('Resolves with stderr when the command succeeds and there is no stdout', async () => {
    await expect(
      subProcess.execute('echo "warn" >&2 && true'),
    ).resolves.toMatch('warn\n');
  });

  test('Rejects with stdout when the command fails', async () => {
    await expect(
      subProcess.execute('echo "error msg" && echo "ignore" >&2 && false'),
    ).rejects.toThrow('error msg\n');
  });

  test('Rejects with stderr when the command fails and there is no stdout', async () => {
    await expect(
      subProcess.execute('echo "error msg" >&2 && false'),
    ).rejects.toThrow('error msg\n');
  });

  test('Considers option.cwd', async () => {
    await expect(
      subProcess.execute('basename $PWD', [], { cwd: __dirname }),
    ).resolves.toEqual('lib\n');
  });

  test('Passes arguments', async () => {
    await expect(subProcess.execute('seq', ['2'])).resolves.toEqual('1\n2\n');
  });
});
