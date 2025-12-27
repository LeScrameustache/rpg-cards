const fse = require('fs-extra');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const path = require('path');
const yauzl = require("yauzl");

const downloadUrl = "https://github.com/seiyria/gameicons-font/archive/master.zip";
const tempDir = "./temp";
const tempFilePath = tempDir + "/temp" + Date.now() + ".zip";
const cssFileName = "game-icons.css";
const eotFileName = "game-icons.eot";
const ttfFileName = "game-icons.ttf";
const woffFileName = "game-icons.woff";
const destDir = "./generator/fonts";

// ----------------------------------------------------------------------------
// Download
// ----------------------------------------------------------------------------
function downloadFile(url, dest, maxRedirects = 5) {
    console.log("  Downloading...");
    return new Promise((resolve, reject) => {
        try {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            const req = client.get(urlObj, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
                    const next = new URL(res.headers.location, urlObj).toString();
                    return resolve(downloadFile(next, dest, maxRedirects - 1));
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage}`));
                    return;
                }
                streamPipeline(res, fse.createWriteStream(dest))
                    .then(resolve)
                    .catch(reject);
            });
            req.on('error', reject);
        } catch (err) {
            reject(err);
        }
    });
}

// ----------------------------------------------------------------------------
// Unzip
// ----------------------------------------------------------------------------
function unzipAll(src, dest) {
    console.log("  Unzipping...");
    return new Promise((resolve, reject) => {
        yauzl.open(src, {lazyEntries: true}, function(err, zipfile) {
            if (err) {
                reject(err);
                return;
            }
            zipfile.readEntry();
            zipfile.on("entry", function(entry) {
                if (/\/$/.test(entry.fileName)) {
                    // Directory file names end with '/'. Note that entries for
                    // directories themselves are optional. An entry's fileName
                    // implicitly requires its parent directories to exist.
                    zipfile.readEntry();
                } else {
                    var entryPath = path.parse(entry.fileName);
                    var fileName = entryPath.base;
                    var targetFile = path.join(dest, fileName);
                    var i = 2;
                    while (true) {
                        if (!fse.existsSync(targetFile)) {
                            break;
                        }
                        fileName = entryPath.name + "-" + i++ + entryPath.ext;
                        targetFile = path.join(dest, fileName);
                    }
                    zipfile.openReadStream(entry, function(err, readStream) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        readStream
                            .on("end", function() {
                                zipfile.readEntry();
                            }).pipe(
                                fse.createWriteStream(targetFile)
                                    .on("error", reject)
                            ).on("error", reject);
                    });
                }
            }).on("close", resolve);
        });
    });
}

// ----------------------------------------------------------------------------
// Copy
// ----------------------------------------------------------------------------
function cleanDirectory(src) {
    console.log("  Cleaning...");
    return new Promise((resolve, reject) => {
        fse.emptyDir(src, (err) => {
            if (err) { reject(); return; }
            resolve();
        });
    }); 
}

function moveFile(src, dst) {
    console.log("  Moving file...");
    return new Promise((resolve, _) => {
        fse.move(src, dst, () => resolve());
    }); 
}

function removeFile(filePath) {
    console.log("  Removing file...");
    return new Promise((resolve, _) => {
        fse.remove(filePath, () => resolve());
    }); 
}

function copyAll(src, dest) {
    console.log("  Copying...");
    return new Promise((resolve, reject) => {
        fse.copy(src, dest, err => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

function moveAll(src, dest) {
    console.log("  Moving...");
    return new Promise((resolve, reject) => {
        fse.move(src, dest, err => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}

function fixCss() {
    // fix gameicons-font issue https://github.com/seiyria/gameicons-font/issues/16
    return new Promise((resolve, reject) => {
        fse.readFile(destDir+"/"+cssFileName, (err, buffer) => {
            if (err) {
                reject(err);
            } else {
                let str = buffer.toString();
                const regex = /"\\([0-9a-fA-F]+)"/gm;
                let m, i = 0, fixNeeded = false;
                while ((m = regex.exec(str)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }
                    // The result can be accessed through the `m`-variable.
                    m.forEach((match, groupIndex) => {
                        if (groupIndex !== 1) return;
                        if (i === 0 && match.length === 5) fixNeeded = true;
                        if (!fixNeeded) return;
                        const matchFixed = match.slice(0,1) + match.slice(2);
                        str = str.replace(`"\\${match}"`, `"\\${matchFixed}"`);
                    });
                    i++;
                }
                fse.writeFile(destDir+"/"+cssFileName, str, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                  });
            }
        })
    });
}

fse.emptyDir(tempDir)
    .then(() => console.log("Fonts: start"))
    .then(() => cleanDirectory(tempDir))
    .then(() => downloadFile(downloadUrl, tempFilePath))
    .then(() => unzipAll(tempFilePath, tempDir))
    .then(() => cleanDirectory(destDir))
    .then(() => moveFile(tempDir+"/"+cssFileName, destDir+"/"+cssFileName))
    .then(() => moveFile(tempDir+"/"+eotFileName, destDir+"/"+eotFileName))
    .then(() => moveFile(tempDir+"/"+ttfFileName, destDir+"/"+ttfFileName))
    .then(() => moveFile(tempDir+"/"+woffFileName, destDir+"/"+woffFileName))
    .then(() => fixCss())
    .then(() => cleanDirectory(tempDir))
    .then(() => console.log("Fonts: done"))
    .catch(err => console.log("Fonts: error", err));
