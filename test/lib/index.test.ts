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
function singlePkgResultMatcher(regexp: RegExp = /(^|\/)Podfile$/): any {
  return {
    plugin: {
      targetFile: expect.stringMatching(regexp),
    },
  };
}

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
        plugin: { runtime: '' },
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
        singlePkgResultMatcher(),
      );
    });

    test('works with the eigen fixture', async () => {
      await expect(inspect(fixtureDir('eigen'))).resolves.toMatchSnapshot(
        singlePkgResultMatcher(),
      );
    });

    test('works with a fixture where no manifest file is present', async () => {
      await expect(
        inspect(fixtureDir('simple_without_manifest')),
      ).resolves.toMatchSnapshot(singlePkgResultMatcher(/(^|\/)Podfile.lock$/));
    });

    test('works with a fixture using a legacy manifest file name', async () => {
      await expect(
        inspect(fixtureDir('legacy_manifest_file')),
      ).resolves.toMatchSnapshot(singlePkgResultMatcher(/^CocoaPods.podfile$/));
    });

    test('fails with a fixture where no lockfile is present', async () => {
      await expect(
        inspect(fixtureDir('simple_without_lockfile')),
      ).rejects.toThrow(
        'Could not find lockfile "Podfile.lock"! This might be resolved by running `pod install`.',
      );
    });
  });

  describe('with a targetFile argument', () => {
    describe('with the simple fixture', () => {
      test('works with the Podfile', async () => {
        await expect(
          inspect(fixtureDir('simple'), 'Podfile'),
        ).resolves.toMatchSnapshot(singlePkgResultMatcher());
      });

      test('works with the Podfile.lock', async () => {
        await expect(
          inspect(fixtureDir('simple'), 'Podfile.lock'),
        ).resolves.toMatchSnapshot(singlePkgResultMatcher());
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

      test('fails if the targetFile uses an unsupported name', async () => {
        await expect(
          inspect(fixtureDir('simple'), 'Cacaofile'),
        ).rejects.toMatchObject({
          message: expect.stringMatching('Unexpected name for target file!'),
        });
      });
    });

    describe('with multi project fixture', () => {
      test('works when the Podfile is in a subdir', async () => {
        await expect(
          inspect(fixtureDir('multi'), 'a/Podfile'),
        ).resolves.toMatchObject(singlePkgResultMatcher(/^a\/Podfile$/));
      });

      test('works when the Podfile.lock is in a subdir', async () => {
        await expect(
          inspect(fixtureDir('multi'), 'a/Podfile.lock'),
        ).resolves.toMatchObject(singlePkgResultMatcher(/^a\/Podfile$/));
      });
    });

    describe('with a fixture where no manifest file is present', () => {
      test('works with the Podfile.lock', async () => {
        await expect(
          inspect(fixtureDir('simple_without_manifest'), 'Podfile.lock'),
        ).resolves.toMatchSnapshot(
          singlePkgResultMatcher(/(^|\/)Podfile.lock$/),
        );
      });
    });

    describe('with a fixture where no lockfile is present', () => {
      test('fails', async () => {
        await expect(
          inspect(fixtureDir('simple_without_lockfile'), 'Podfile'),
        ).rejects.toThrow(
          'Could not find lockfile "Podfile.lock"! This might be resolved by running `pod install`.',
        );
      });
    });

    describe('with a fixture using a legacy file name', () => {
      test('works with the CocoaPods.podfile', async () => {
        await expect(
          inspect(fixtureDir('legacy_manifest_file')),
        ).resolves.toMatchSnapshot(
          singlePkgResultMatcher(/^CocoaPods.podfile$/),
        );
      });

      test('fails if the targetFile doesn’t exist', async () => {
        await expect(
          inspect(fixtureDir('legacy_manifest_file'), 'Podfile'),
        ).rejects.toThrow('Given target file ("Podfile") doesn\'t exist!');
      });
    });
  });

  describe('with options.strictOutOfSync=true as argument', () => {
    test('succeeds when the checksum matches', async () => {
      await expect(
        inspect(fixtureDir('simple'), undefined, {
          strictOutOfSync: true,
        }),
      ).resolves.not.toBeUndefined();
    });

    test('fails when the checksum mismatches', async () => {
      await expect(
        inspect(fixtureDir('simple_with_checksum_mismatch'), undefined, {
          strictOutOfSync: true,
        }),
      ).rejects.toThrowError(
        'Your Podfile ("Podfile") is not in sync with your lockfile ("Podfile.lock"). Please run "pod install" and try again.',
      );
    });

    test('fails when there is no manifest', async () => {
      await expect(
        inspect(fixtureDir('simple_without_manifest'), undefined, {
          strictOutOfSync: true,
        }),
      ).rejects.toThrow(
        'Option `--strict-out-of-sync=true` given, but no manifest file could be found!',
      );
    });

    test('fails when there is no checksum', async () => {
      await expect(
        inspect(fixtureDir('legacy_lockfile'), undefined, {
          strictOutOfSync: true,
        }),
      ).rejects.toThrow(
        'Option `--strict-out-of-sync=true` given, but lockfile doesn\'t encode checksum of Podfile! Try to update the CocoaPods integration via "pod install" or omit the option.',
      );
    });
  });

  test('fails if the targetFile cannot be parsed', async () => {
    await expect(
      inspect(fixtureDir('lockfile_in_conflict')),
    ).rejects.toThrowError(
      /^Error while parsing Podfile.lock:\ncan not read a block mapping entry/,
    );
  });

  describe('with an options.subProject argument', () => {
    test('fails', async () => {
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
