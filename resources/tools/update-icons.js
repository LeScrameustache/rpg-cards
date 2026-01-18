const fse = require('fs-extra');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const path = require('path');
const yauzl = require("yauzl");

const downloadUrl = "https://game-icons.net/archives/svg/zip/ffffff/transparent/game-icons.net.svg.zip";
const tempDir = "./temp";
const tempFilePath = tempDir + "/temp" + Date.now() + ".zip";
const iconDir = "./generator/icons";
const customIconDir = "./resources/custom-icons";
const cssPath = "./generator/css/icons.css";
const jsPath = "./generator/js/icons.js";


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
                    // follow redirect
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
// Generate CSS
// ----------------------------------------------------------------------------
function generateCSS(src, dest) {
    console.log("  Generating CSS...");
    return new Promise((resolve, reject) => {
        fse.readdir(src, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                const imageExtensions = [".svg", ".png"];
                const content = files
                    .filter(fileName => imageExtensions.find(ext => ext === path.extname(fileName)))
                    .map(name => `.icon-${path.basename(name, path.extname(name))} { background-image: url(../icons/${name});}\n`)
                    .join("");
                fse.writeFile(dest, content, err => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            }
        });
    });
}

// ----------------------------------------------------------------------------
// Generate JS
// ----------------------------------------------------------------------------
function generateJS(src, dest) {
    console.log("  Generating JS...");
    return new Promise((resolve, reject) => {
        fse.readdir(src, (err, files) => {
            if (err) {
                reject(err);
            }
            else {
                const imageExtensions = [".svg", ".png"];
                const content = "var icon_names = [\n" + files
                    .filter(fileName => imageExtensions.find(ext => ext === path.extname(fileName)))
                    .map(name => `    "${path.basename(name, path.extname(name))}"`)
                    .join(",\n") + "\n]";
                fse.writeFile(dest, content, err => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            }
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

fse.emptyDir(tempDir)
    .then(() => console.log("Icons: start"))
    .then(() => cleanDirectory(tempDir))
    .then(() => downloadFile(downloadUrl, tempFilePath))
    .then(() => unzipAll(tempFilePath, tempDir))
    .then(() => removeFile(tempFilePath))
    .then(() => cleanDirectory(iconDir))
    .then(() => moveAll(tempDir, iconDir))
    .then(() => copyAll(customIconDir, iconDir))
    .then(() => generateCSS(iconDir, cssPath))
    .then(() => generateJS(iconDir, jsPath))
    .then(() => cleanDirectory(tempDir))
    .then(() => console.log("Icons: done"))
    .catch(err => console.log("Icons: error", err));
