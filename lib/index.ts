import * as fs from 'fs';
import * as path from 'path';
import * as subProcess from './sub-process';
import LockfileParser from '@snyk/cocoapods-lockfile-parser';
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

export async function inspect(
  root: string,
  givenTargetFile?: string,
  options?: SingleSubprojectInspectOptions,
): Promise<SinglePackageResult> {
  if (!options) {
    options = {dev: false};
  }

  if (options.subProject) {
    throw new Error("The CocoaPods plugin doesn't support specifying a subProject!");
  }

  let targetFile: string;
  if (givenTargetFile) {
    targetFile = path.resolve(root, givenTargetFile);
  } else {
    const discoveredTargetFile = await findTargetFile(root);
    if (!discoveredTargetFile) {
      throw new Error("No target file given and couldn’t automatically find one!");
    }
    targetFile = discoveredTargetFile;
  }
  
  const plugin: PluginMetadata = {
    meta: {},
    name: 'cocoapods',
    runtime: await cocoapodsVersion(root),
    targetFile,
  };
  const depTree = await getAllDeps(root, targetFile);
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

async function findTargetFile(root: string): Promise<string | undefined> {
  const targetFilePath = path.join(root, "Podfile.lock");
  if (await fsExists(targetFilePath)) {
    return targetFilePath;
  }
}

async function getAllDeps(root: string, targetFile: string): Promise<DepTree> {
  const parser = await LockfileParser.readFile(targetFile);
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
