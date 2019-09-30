import * as fs from 'fs';
import * as path from 'path';
import * as subProcess from './sub-process';
import { LockfileParser } from '@snyk/cocoapods-lockfile-parser';
import {
  SingleSubprojectInspectOptions, SinglePackageResult,
  PluginMetadata, SingleSubprojectPlugin,
} from '@snyk/cli-interface/dist/legacy/plugin';
import { DepTree } from '@snyk/cli-interface/dist/legacy/common';
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

export async function inspect(
  root: string,
  targetFile?: string,
  options?: SingleSubprojectInspectOptions,
): Promise<SinglePackageResult> {
  if (!options) {
    options = {dev: false};
  }

  if (options.subProject) {
    throw new Error("The CocoaPods plugin doesn't support specifying a subProject!");
  }

  let lockfilePath: string;
  async function expectToFindLockfile(): Promise<string> {
    const discoveredLockfilePath = await findLockfile(root);
    if (!discoveredLockfilePath) {
      throw new Error("Could not find lockfile \"Podfile.lock\"! This might be resolved by running `pod install`.");
    }
    return discoveredLockfilePath;
  }

  let manifestFilePath: string | undefined;
  if (targetFile) {
    const { base } = path.parse(targetFile);
    if (base === LOCKFILE_NAME) {
      lockfilePath = targetFile;
      manifestFilePath = await findManifestFile(root);
    } else if (MANIFEST_FILE_NAMES.indexOf(targetFile) !== -1) {
      const absTargetFilePath = path.join(root, targetFile);
      if (!await fsExists(absTargetFilePath)) {
        throw new Error(`Given target file ("${targetFile}") doesn't exist!`)
      }
      manifestFilePath = targetFile;
      lockfilePath = await expectToFindLockfile();
    } else {
      throw new Error("Unexpected name for target file!");
    }
  } else {
    manifestFilePath = await findManifestFile(root);
    lockfilePath = await expectToFindLockfile();
  }
  
  const plugin: PluginMetadata = {
    meta: {},
    name: 'cocoapods',
    runtime: await cocoapodsVersion(root),
    targetFile: manifestFilePath || lockfilePath,
  };
  const absLockfilePath = path.join(root, lockfilePath);
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

async function findManifestFile(root: string): Promise<string | undefined> {
  for (const manifestFileName of MANIFEST_FILE_NAMES) {
    const targetFilePath = path.join(root, manifestFileName);
    if (await fsExists(targetFilePath)) {
      return manifestFileName;
    }
  }
}

async function findLockfile(root: string): Promise<string | undefined> {
  const lockfilePath = path.join(root, LOCKFILE_NAME);
  if (await fsExists(lockfilePath)) {
    return LOCKFILE_NAME;
  }
}

async function getAllDeps(lockfilePath: string): Promise<DepTree> {
  const parser = await LockfileParser.readFile(lockfilePath);
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
