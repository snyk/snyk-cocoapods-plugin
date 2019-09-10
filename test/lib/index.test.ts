import { inspect } from '../../lib/index';
import { fixtureDir } from '../common';
import { execute } from '../../lib/sub-process';

jest.mock('../../lib/sub-process');

const mockedExecute = (execute as unknown) as jest.MockedFunction<
  typeof execute
>;

// Note: `any` is necessary due to a quirk between jest and TypeScript.
// The propertyMatchers argument has the compile type `{ then: any, catch: any }`,
// which is not the runtime type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const singlePkgResultMatcher: any = {
  plugin: {
    targetFile: expect.stringMatching(/\/Podfile.lock$/),
  },
};

describe('inspect(rootDir, targetFile?, options?)', () => {
  beforeEach(() => {
    mockedExecute.mockResolvedValueOnce('1.7.5');
  });

  afterEach(() => {
    mockedExecute.mockClear();
  });

  describe('includes the runtime version', () => {
    test('from bundled CocoaPods', async () => {
      const rootDir = fixtureDir('simple');

      await expect(inspect(rootDir)).resolves.toMatchObject({
        plugin: { runtime: '1.7.5' },
      });

      expect(mockedExecute.mock.calls).toEqual([
        ['bundle exec pod', ['--version'], { cwd: rootDir }],
      ]);
    });

    test('from globally installed CocoaPods if there is no bundled', async () => {
      mockedExecute.mockReset();
      mockedExecute.mockRejectedValueOnce(
        new Error('Could not locate Gemfile or .bundle/ directory'),
      );
      mockedExecute.mockResolvedValueOnce('1.7.5');

      const rootDir = fixtureDir('simple');

      await expect(inspect(rootDir)).resolves.toMatchObject({
        plugin: { runtime: '1.7.5' },
      });

      expect(mockedExecute.mock.calls).toEqual([
        ['bundle exec pod', ['--version'], { cwd: rootDir }],
        ['pod', ['--version'], { cwd: rootDir }],
      ]);
    });

    test('but doesn’t fail if the CocoaPods CLI cannot be found', async () => {
      mockedExecute.mockReset();
      mockedExecute.mockRejectedValueOnce(
        new Error('Could not locate Gemfile or .bundle/ directory'),
      );
      mockedExecute.mockRejectedValueOnce(new Error('command not found: pod'));

      const rootDir = fixtureDir('simple');

      await expect(inspect(rootDir)).resolves.toMatchObject({
        plugin: { runtime: '[COULD NOT RUN pod --version]' },
      });

      expect(mockedExecute.mock.calls).toEqual([
        ['bundle exec pod', ['--version'], { cwd: rootDir }],
        ['pod', ['--version'], { cwd: rootDir }],
      ]);
    });
  });

  describe('without targetFile argument', () => {
    test('works with the simple fixture', async () => {
      await expect(inspect(fixtureDir('simple'))).resolves.toMatchSnapshot(
        singlePkgResultMatcher,
      );
    });

    test('works with the eigen fixture', async () => {
      await expect(inspect(fixtureDir('eigen'))).resolves.toMatchSnapshot(
        singlePkgResultMatcher,
      );
    });
  });

  describe('with a targetFile argument', () => {
    test('works with the simple fixture', async () => {
      await expect(inspect(fixtureDir('simple'))).resolves.toMatchSnapshot(
        singlePkgResultMatcher,
      );
    });

    test('fails if the targetFile doesn’t exist', async () => {
      await expect(
        inspect(fixtureDir('simple'), './no/Podfile.lock'),
      ).rejects.toMatchObject({
        message: expect.stringMatching(
          "ENOENT: no such file or directory, open '[^']*no/Podfile.lock'",
        ),
      });
    });
  });

  describe('with an options.subProject argument', () => {
    test('works with the simple fixture', async () => {
      await expect(
        inspect(fixtureDir('simple'), undefined, {
          subProject: 'doesntMatter',
        }),
      ).rejects.toThrow(
        "The CocoaPods plugin doesn't support specifying a subProject!",
      );
    });
  });
});
