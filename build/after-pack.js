// electron-builder afterPack hook: drops parts of Electron that NEKO never uses, before the installer is made.
//   dxcompiler.dll / dxil.dll   Direct3D 12 shader compiler, only used by WebGPU (~25 MB)
// Languages are trimmed by "electronLanguages" in package.json.
const fs = require('node:fs');
const path = require('node:path');

const UNUSED = ['dxcompiler.dll', 'dxil.dll'];

exports.default = async ({ appOutDir }) => {
  for (const name of UNUSED) fs.rmSync(path.join(appOutDir, name), { force: true });
};
