import fs from 'fs';
import os from 'os';
import path from 'path';

const projectRoot = process.cwd();
const tempDir = os.tmpdir();

const protectedPaths = [
  'package.json',
  'package-lock.json',
  'server.ts',
  'vite.config.ts',
  'tsconfig.json',
  'src',
  'app',
  'public',
  'docs',
  'firestore.rules',
  'firestore.indexes.json',
  'firebase-applet-config.json',
  'firebase-applet-config.example.json',
  'metadata.json',
  'firebase.json',
  'config.json'
].map(p => path.join(projectRoot, p));

const safePaths = [
  path.join(projectRoot, 'node_modules', '.vitest'),
  path.join(projectRoot, 'coverage'),
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, 'tmp'),
  path.join(projectRoot, '.tmp'),
  tempDir
];

export function checkPath(target: fs.PathLike): void {
  const targetStr = target.toString();
  const absolutePath = path.resolve(targetStr);

  const isSafe = safePaths.some(p => absolutePath === p || absolutePath.startsWith(p + path.sep));
  if (isSafe) return;

  const isProtected = protectedPaths.some(p => absolutePath === p || absolutePath.startsWith(p + path.sep));
  
  if (isProtected) {
    throw new Error(`Blocked destructive test filesystem operation against protected project file: ${targetStr}`);
  }
}

const originalRm = fs.rm;
const originalRmSync = fs.rmSync;
const originalRmdir = fs.rmdir;
const originalRmdirSync = fs.rmdirSync;
const originalUnlink = fs.unlink;
const originalUnlinkSync = fs.unlinkSync;
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;

const originalPromisesRm = fs.promises?.rm;
const originalPromisesRmdir = fs.promises?.rmdir;
const originalPromisesUnlink = fs.promises?.unlink;
const originalPromisesWriteFile = fs.promises?.writeFile;

fs.rmSync = function (path: fs.PathLike, options?: fs.RmOptions) {
  checkPath(path);
  return originalRmSync.apply(this, [path, options as any]);
};

fs.rmdirSync = function (path: fs.PathLike, options?: fs.RmDirOptions) {
  checkPath(path);
  return originalRmdirSync.apply(this, [path, options as any]);
} as any;

fs.unlinkSync = function (path: fs.PathLike) {
  checkPath(path);
  return originalUnlinkSync.apply(this, [path]);
};

fs.writeFileSync = function (path: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) {
  if (typeof path === 'string' || Buffer.isBuffer(path) || path instanceof URL) {
    checkPath(path as fs.PathLike);
  }
  return originalWriteFileSync.apply(this, [path, data, options]);
};

fs.rm = function (path: fs.PathLike, ...args: any[]) {
  try {
    checkPath(path);
  } catch (e) {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') return cb(e);
    throw e;
  }
  return originalRm.apply(this, [path, ...args] as any);
} as typeof fs.rm;

fs.rmdir = function (path: fs.PathLike, ...args: any[]) {
  try {
    checkPath(path);
  } catch (e) {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') return cb(e);
    throw e;
  }
  return originalRmdir.apply(this, [path, ...args] as any);
} as typeof fs.rmdir;

fs.unlink = function (path: fs.PathLike, cb: fs.NoParamCallback) {
  try {
    checkPath(path);
  } catch (e) {
    if (typeof cb === 'function') return cb(e);
    throw e;
  }
  return originalUnlink.call(this, path, cb);
} as typeof fs.unlink;

fs.writeFile = function (path: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...args: any[]) {
  try {
    if (typeof path === 'string' || Buffer.isBuffer(path) || path instanceof URL) {
      checkPath(path as fs.PathLike);
    }
  } catch (e) {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') return cb(e);
    throw e;
  }
  return originalWriteFile.apply(this, [path, data, ...args] as any);
} as typeof fs.writeFile;

if (fs.promises) {
  const p = fs.promises as any;
  if (originalPromisesRm) {
    p.rm = async function (path: fs.PathLike, options?: fs.RmOptions) {
      checkPath(path);
      return originalPromisesRm.apply(this, [path, options as any]);
    };
  }
  if (originalPromisesRmdir) {
    p.rmdir = async function (path: fs.PathLike, options?: fs.RmDirOptions) {
      checkPath(path);
      return originalPromisesRmdir.apply(this, [path, options as any]);
    };
  }
  if (originalPromisesUnlink) {
    p.unlink = async function (path: fs.PathLike) {
      checkPath(path);
      return originalPromisesUnlink.apply(this, [path]);
    };
  }
  if (originalPromisesWriteFile) {
    p.writeFile = async function (path: fs.PathLike | fs.promises.FileHandle, data: any, options?: any) {
      if (typeof path === 'string' || Buffer.isBuffer(path) || path instanceof URL) {
        checkPath(path as fs.PathLike);
      }
      return originalPromisesWriteFile.apply(this, [path, data, options]);
    };
  }
}
