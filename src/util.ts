import * as qs from 'qs';
import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';

import * as urllib from 'url';
import * as log4js from 'log4js';
import * as xmlreader from 'xmlreader';

const loggerMap = new Map();

export function getLogger(name = 'default') {
  if (loggerMap.has(name)) return loggerMap.get(name);
  const logger = log4js.getLogger(name);
  if (log4js.levels.OFF.isEqualTo(logger.level)) {
    logger.level = 'debug';
  }
  loggerMap.set(name, logger);
  return logger;
}

/**
 * 拼接url
 * @returns {string}
 */
export function joinUrlPath(...argsss) {
  const args = Array.prototype.slice.call(argsss);
  let p = '';
  const reg1 = /\/$/;
  const reg2 = /^\//;
  const reg3 = /^http(s)?:/;
  args.forEach((arg) => {
    if (arg === '') return;
    if (reg1.test(p) && reg2.test(arg)) {
      p = p.substring(0, p.length - 1);
    } else if (!reg1.test(p) && !reg2.test(arg) && !reg3.test(arg)) {
      p = `${p}/`;
    }
    p = p + arg;
  });
  return p;
}

/**
 * 给oriurl添加query参数
 * @param oriurl
 * @param params
 * @returns {string}
 */
export function fillUrl(oriurl, params = {}) {
  const obj = urllib.parse(oriurl, true);
  Object.assign(obj.query, params || {});
  const searchStr = qs.stringify(obj.query);
  if (searchStr) {
    obj.search = `?${searchStr}`;
  }
  return urllib.format(obj);
}

let DecryptBinding = null;

export function decryptDBPassWord(password) {
  if (!DecryptBinding) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DecryptBinding = require('node-gyp-build')(path.resolve(__dirname, '..'));
  }
  return DecryptBinding.DecryptDBPassWord(password);
}

export async function xmlPath2json(xmlPath) {
  const xmlContent = await new Promise((resolve, reject) => {
    fs.readFile(xmlPath, { encoding: 'utf8' }, (err, content) => {
      if (err) reject(err);
      resolve(content);
    });
  });
  return new Promise(((resolve, reject) => {
    xmlreader.read(xmlContent, (err, ret) => {
      if (err) {
        reject(err);
      } else {
        resolve(ret);
      }
    });
  }));
}

export function getXmlNodeValue(node) {
  if (node?.text) {
    return node.text();
  }
  if (node) {
    return '';
  }
}

export function getXmlNodeAttr(node, attr, parser?: Function) {
  if (node?.attributes) {
    const attrs = node.attributes();
    // logger.debug('attrs', attrs);
    let val = attrs[attr];
    if (parser && val !== undefined) {
      val = parser(val);
    }
    return val;
  }
}

export function trimString(val) {
  if (typeof val === 'string') {
    return val.trim();
  }
  return val;
}

/**
 * 判断一个文件路径是否存在
 * @param file
 * @param mode
 */
export function checkFileExists(file, mode = fs.constants.F_OK) {
  return new Promise((resolve, reject) => {
    fs.access(file, mode, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export function getFileLastModifyTime(filePath): Promise<number> {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stat) => {
      if (err) {
        reject(err);
      } else {
        resolve(stat.mtimeMs);
      }
    });
  });
}

export function getRoleFilePath(configureBaseDir, roleName) {
  return `${path.resolve(process.cwd(), configureBaseDir, roleName)}_dal.xml`;
}

export async function getConfigDir() {
  let isIdc = false;
  let is995 = false;
  const sysmeta: any = await readMetaFile('/home/qspace/etc/sysmeta.conf');
  if (sysmeta.General.HostRole === '1') {
    isIdc = false;
  } else {
    isIdc = true;
  }
  if (!isIdc) {
    const mmpayevctestenv: any = await readMetaFile('/home/qspace/etc/client/global/mmpayevctestenv.conf');
    if (mmpayevctestenv.General.IsGamma === '1') {
      is995 = true;
    }
  }
  if (isIdc || is995) {
    return '/home/qspace/etc/client/global/dbroute';
  }
  return '/home/qspace/etc/mmpayca';
}

export function readMetaFile(path) {
  return new Promise((resolve, reject) => {
    try {
      fs.readFile(path, { encoding: 'utf8' }, (err, fileContent) => {
        if (err) {
          console.error(`Fail to read file, ${path} ${err}`);
          reject(err);
        } else {
          resolve(ini.parse(fileContent));
        }
      });
    } catch (error) {
      console.error(`Fail to read file, ${path} ${error}`);
      reject(error);
    }
  });
}

export function makeDBPrivilegeKey(strServiceName: string, dwCmd: number, strTableName: string): string {
  return `${strServiceName} ${strTableName} ${dwCmd.toString(16)}`;
}

export function makeHostPattern(strHost: string): string {
  return strHost.replace(/[.:]/ig, '_');
}

export function inheritEvents(source, target, events) {
  const listeners = {};
  target
    .on('newListener', (eventName) => {
      if (events.indexOf(eventName) >= 0 && !target.listenerCount(eventName)) {
        source.on(
          eventName,
          (listeners[eventName] = function (...ars) {
            const args = [].slice.call(ars);
            args.unshift(eventName);

            target.emit(...args);
          }),
        );
      }
    })
    .on('removeListener', (eventName) => {
      if (events.indexOf(eventName) >= 0 && !target.listenerCount(eventName)) {
        source.removeListener(eventName, listeners[eventName]);
        delete listeners[eventName];
      }
    });
}
