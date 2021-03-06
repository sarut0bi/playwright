/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This file is only run when someone installs via the github repo

const {execSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const rmAsync = util.promisify(require('rimraf'));
const existsAsync = path => fs.promises.access(path).then(() => true, e => false);

(async () => {
  const SRC_FOLDER = path.join(__dirname, 'src');
  const LIB_FOLDER = path.join(__dirname, 'lib');
  const srcTypeScriptFiles = (await listFiles(path.join(__dirname, 'src'))).filter(filepath => filepath.toLowerCase().endsWith('.ts'));
  const outdatedFiles = await Promise.all(srcTypeScriptFiles.map(async srcFile => {
    const libFileTS = path.join(LIB_FOLDER, path.relative(SRC_FOLDER, srcFile));
    const libFile = libFileTS.substring(0, libFileTS.lastIndexOf('.')) + '.js';
    try {
      const [srcStat, libStat] = await Promise.all([fs.promises.stat(srcFile), fs.promises.stat(libFile)]);
      return srcStat.ctimeMs > libStat.ctimeMs;
    } catch (e) {
      // Either `.ts` of `.js` file is missing - rebuild is required.
      return true;
    }
  }));
  if (outdatedFiles.some(Boolean)) {
    console.log(`Rebuilding playwright...`);
    try {
      execSync('npm run build', {
        stdio: 'ignore'
      });
    } catch (e) {
    }
  }
  await downloadAllBrowsersAndGenerateProtocolTypes();
})();

async function listFiles(dirpath) {
  const files = [];
  await dfs(dirpath);
  return files;

  async function dfs(dirpath) {
    const entries = await fs.promises.readdir(dirpath, {withFileTypes: true});
    files.push(...entries.filter(entry => entry.isFile()).map(entry => path.join(dirpath, entry.name)));
    await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => dfs(path.join(dirpath, entry.name))));
  }
}

async function downloadAllBrowsersAndGenerateProtocolTypes() {
  const {downloadBrowserWithProgressBar, localDownloadOptions} = require('./download-browser');
  const protocolGenerator = require('./utils/protocol-types-generator');
  const chromiumOptions = localDownloadOptions('chromium');
  const firefoxOptions = localDownloadOptions('firefox');
  const webkitOptions = localDownloadOptions('webkit');
  if (!(await existsAsync(chromiumOptions.downloadPath))) {
    await downloadBrowserWithProgressBar(chromiumOptions);
    await protocolGenerator.generateChromiumProtocol(chromiumOptions.executablePath).catch(console.warn);
  }
  if (!(await existsAsync(firefoxOptions.downloadPath))) {
    await downloadBrowserWithProgressBar(firefoxOptions);
    await protocolGenerator.generateFirefoxProtocol(firefoxOptions.executablePath).catch(console.warn);
  }
  if (!(await existsAsync(webkitOptions.downloadPath))) {
    await downloadBrowserWithProgressBar(webkitOptions);
    await protocolGenerator.generateWebKitProtocol(webkitOptions.downloadPath).catch(console.warn);
  }

  // Cleanup stale revisions.
  const directories = new Set(await readdirAsync(path.join(__dirname, '.local-browsers')));
  directories.delete(chromiumOptions.downloadPath);
  directories.delete(firefoxOptions.downloadPath);
  directories.delete(webkitOptions.downloadPath);
  // cleanup old browser directories.
  directories.add(path.join(__dirname, '.local-chromium'));
  directories.add(path.join(__dirname, '.local-firefox'));
  directories.add(path.join(__dirname, '.local-webkit'));
  await Promise.all([...directories].map(directory => rmAsync(directory)));

  try {
    console.log('Generating types...');
    execSync('npm run generate-types');
  } catch (e) {
  }

  async function readdirAsync(dirpath) {
    return fs.promises.readdir(dirpath).then(dirs => dirs.map(dir => path.join(dirpath, dir)));
  }
}
