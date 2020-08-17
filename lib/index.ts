import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as subProcess from './sub-process';
import { LockfileParser } from '@snyk/cocoapods-lockfile-parser';
import {
  SingleSubprojectInspectOptions, SinglePackageResult,
  PluginMetadata, SingleSubprojectPlugin,
} from '@snyk/cli-interface/legacy/plugin';
import { DepTree } from '@snyk/cli-interface/legacy/common';
import { graphToDepTree } from '@snyk/dep-graph/dist/legacy';

// Compile-time check that we are implementing the plugin API properly
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _: SingleSubprojectPlugin = {
  pluginName(): "snyk-cocoapods-plugin" {
    return "snyk-cocoapods-plugin"
  },
  inspect,
};

const MANIFEST_FILE_NAMES = [
  "CocoaPods.podfile.yaml",
  "CocoaPods.podfile",
  "Podfile",
  "Podfile.rb",
];

const LOCKFILE_NAME = "Podfile.lock";

export interface CocoaPodsInspectOptions extends SingleSubprojectInspectOptions {
  strictOutOfSync?: boolean;
}

export async function inspect(
  root: string,
  targetFile?: string,
  options?: CocoaPodsInspectOptions,
): Promise<SinglePackageResult> {
  if (!options) {
    options = {dev: false};
  }
  if (!("strictOutOfSync" in options)) {
    options.strictOutOfSync = false;
  }

  if (options.subProject) {
    throw new Error("The CocoaPods plugin doesn't support specifying a subProject!");
  }

  let lockfilePath: string;
  async function expectToFindLockfile(dir = '.'): Promise<string> {
    const discoveredLockfilePath = await findLockfile(root, dir);
    if (!discoveredLockfilePath) {
      throw new Error("Could not find lockfile \"Podfile.lock\"! This might be resolved by running `pod install`.");
    }
    return discoveredLockfilePath;
  }

  let manifestFilePath: string | undefined;
  if (targetFile) {
    const { base, dir } = path.parse(targetFile);
    if (base === LOCKFILE_NAME) {
      lockfilePath = targetFile;
      manifestFilePath = await findManifestFile(root, dir);
    } else if (MANIFEST_FILE_NAMES.indexOf(base) !== -1) {
      const absTargetFilePath = path.join(root, targetFile);
      if (!await fsExists(absTargetFilePath)) {
        throw new Error(`Given target file ("${targetFile}") doesn't exist!`)
      }
      manifestFilePath = targetFile;
      lockfilePath = await expectToFindLockfile(dir);
    } else {
      throw new Error("Unexpected name for target file!");
    }
  } else {
    manifestFilePath = await findManifestFile(root);
    lockfilePath = await expectToFindLockfile();
  }

  const absLockfilePath = path.join(root, lockfilePath);

  if (options.strictOutOfSync) {
    if (!manifestFilePath) {
      throw new Error("Option `--strict-out-of-sync=true` given, but no manifest file could be found!");
    }
    const absManifestFilePath = path.join(root, manifestFilePath);

    const result = await verifyChecksum(absManifestFilePath, absLockfilePath);
    if (result === ChecksumVerificationResult.NoChecksumInLockfile) {
      throw new Error("Option `--strict-out-of-sync=true` given, but lockfile doesn't encode checksum of Podfile! "
                    + "Try to update the CocoaPods integration via \"pod install\" or omit the option.");
    }
    if (result === ChecksumVerificationResult.Invalid) {
      throw new OutOfSyncError(manifestFilePath, lockfilePath);
    }
  }

  const plugin: PluginMetadata = {
    meta: {},
    name: 'cocoapods',
    runtime: await cocoapodsVersion(root),
    targetFile: manifestFilePath || lockfilePath,
  };
  const depTree = await getAllDeps(absLockfilePath);
  return {
    package: depTree,
    plugin,
  };
}

async function fsExists(pathToTest: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      fs.exists(pathToTest, (exists) => resolve(exists))
    } catch (error) {
      reject(error)
    }
  })
}

async function fsReadFile(filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return
      }
      resolve(data);
    })
  });
}

async function findManifestFile(root: string, dir = '.'): Promise<string | undefined> {
  for (const manifestFileName of MANIFEST_FILE_NAMES) {
    const targetFilePath = path.join(root, dir, manifestFileName);
    if (await fsExists(targetFilePath)) {
      return path.join(dir, manifestFileName);
    }
  }
}

async function findLockfile(root: string, dir = '.'): Promise<string | undefined> {
  const lockfilePath = path.join(root, dir, LOCKFILE_NAME);
  if (await fsExists(lockfilePath)) {
    return path.join(dir, LOCKFILE_NAME);
  }
}

enum ChecksumVerificationResult {
  Valid,
  Invalid,
  NoChecksumInLockfile
}

async function verifyChecksum(manifestFilePath: string, lockfilePath: string): Promise<ChecksumVerificationResult> {
  const manifestFileContents = await fsReadFile(manifestFilePath);
  const checksum = crypto.createHash('sha1').update(manifestFileContents).digest('hex');
  const parser = await LockfileParser.readFile(lockfilePath);
  if (parser.podfileChecksum === undefined) {
    return ChecksumVerificationResult.NoChecksumInLockfile;
  } else if (parser.podfileChecksum === checksum) {
    return ChecksumVerificationResult.Valid;
  } else {
    return ChecksumVerificationResult.Invalid;
  }
}

async function getAllDeps(lockfilePath: string): Promise<DepTree> {
  let parser: LockfileParser;
  try {
    parser = await LockfileParser.readFile(lockfilePath);
  } catch (error) {
    throw new Error(`Error while parsing ${LOCKFILE_NAME}:\n${error.message}`);
  }
  const graph = parser.toDepGraph();
  return graphToDepTree(graph, "cocoapods") as DepTree;
}

async function cocoapodsVersion(root: string): Promise<string> {
  let podVersionOutput = '';
  try {
    // 1st: try to run CocoaPods via bundler
    podVersionOutput = await subProcess.execute('bundle exec pod', ['--version'], {cwd: root});
  } catch {
    try {
      // 2nd: try to run CocoaPods directly
      podVersionOutput = await subProcess.execute('pod', ['--version'], {cwd: root});
    } catch {
      // intentionally empty
    }
  }
  return podVersionOutput.trim();
}

export class OutOfSyncError extends Error {
  public code = 422;
  public name = 'OutOfSyncError';

  public constructor(manifestFileName: string, lockfileName: string) {
    super(`Your Podfile ("${manifestFileName}") is not in sync ` +
      `with your lockfile ("${lockfileName}"). ` +
      `Please run "pod install" and try again.`);
    Error.captureStackTrace(this, OutOfSyncError);
  }
}
