import { GetDBConnectionReturn, HOST_TYPE, PhysicalDBGroupConf, PoolConnectionExt } from './dal_set_types';
import { DBConnection } from './db_connection';
import { oDBConnectionManager } from './db_connection_manager';
import { makeHostPattern } from './util';
import { PoolCluster, PoolConnection } from 'mysql';
import { OSS_KEY_POINT, OSSATTR } from './oss_reporter';
import logger from './logger';
import { DALSetDBConfig } from './dal_set_config';

interface InitOptions {
  oDBGroupConf: PhysicalDBGroupConf;
  vecFirstHost: Array<string>;
  vecSecondHost: Array<string>;
  vecBacHost: Array<string>;

  strDBName: string;
  strDBUser: string;
  strPassword: string;
  strCharSet: string;
}

interface PoolOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  charset: string;
  timezone?: string;
  connectTimeout?: number; // 连接超时时间
  dateStrings?: boolean;

  acquireTimeout?: number; // 在队列里最长等待时间
  connectionLimit?: number; // 连接池的最大连接数

}

// interface PoolCluster {
//     add(id: string, config: PoolOptions): void;
//     remove(id: string);
//     of(pattern: string | RegExp, selector: string);
//     getConnection(cb: Function);
//     end();
// }

interface PoolNamespace {
  getConnection(cb: Function);

  query(cb: Function);
}

interface GetDBConnectionOptions {
  strDBName: string;
  strDBUser: string;
  strPassword: string;
  strCharSet: string;
}

interface HostUseInfo {
  host: string;
  patternHost: string;
  successCount: number;
  lastSuccessTime: number;
}

interface ChangeUserParams {
  user?: string;
  password?: string;
  database?: string;
  charset?: string;
}

export class DBConnectionSelector {
  public m_dbConfig: DALSetDBConfig;

  public m_oPoolCluster: PoolCluster;
  public m_iGroupID: number; // 物理组的组ID
  public m_vecTotalHost: Array<string>;
  public m_mapHostInfo: Map<string, HostUseInfo>;

  public m_eHostType: HOST_TYPE;
  public m_iFirstIndex: number;
  public m_iSecondIndex: number;
  public m_iBacIndex: number;

  public m_vecFirstHost: Array<string>;
  public m_vecSecondHost: Array<string>;
  public m_vecBacHost: Array<string>;

  public m_strKey: string;
  public m_bClosed: boolean;
  public m_iLastCallTime: number;

  public constructor(poolCluster, iGroupID: number, dbConfig: DALSetDBConfig) {
    this.m_oPoolCluster = poolCluster;
    this.m_iGroupID = iGroupID;
    this.m_vecTotalHost = [];
    this.m_mapHostInfo = new Map();

    this.m_eHostType = HOST_TYPE.FIRST_HOST;
    this.m_iFirstIndex = -1;
    this.m_iSecondIndex = -1;
    this.m_iBacIndex = -1;

    this.m_vecFirstHost = [];
    this.m_vecSecondHost = [];
    this.m_vecBacHost = [];

    this.m_dbConfig = dbConfig;
    this.m_strKey = '';
    this.m_bClosed = false;
    this.m_iLastCallTime = 0;

    this.m_oPoolCluster.on('remove', (nodeId) => {
      logger.debug(`REMOVED NODE : ${nodeId}`); //
    });
  }

  /**
   * 一段时间后没有使用的selector，可以关闭
   */
  public Close() {
    logger.debug('DBConnectionSelector|Close');
    this.m_bClosed = true;
    // this.m_oPoolCluster.end((err) => {
    //   if (err) {
    //     logger.error('DBConnectionSelector|Close', err?.message);
    //   }
    // });
  }

  public Init(options: InitOptions) {
    const { oDBGroupConf, vecFirstHost, vecSecondHost, vecBacHost, strDBName, strDBUser, strPassword, strCharSet } = options;
    const oDBConfig = this.m_dbConfig;

    if (vecFirstHost.length <= 0) {
      logger.debug('first host is empty');
      throw Error('first host is empty');
    }

    let bChanged = false;

    if (!this._IsHostSame(this.m_vecFirstHost, vecFirstHost)) {
      bChanged = true;
      this.m_vecFirstHost = vecFirstHost;
      logger.debug('vecFirstHost changed');
    }

    if (!this._IsHostSame(this.m_vecSecondHost, vecSecondHost)) {
      bChanged = true;
      this.m_vecSecondHost = vecSecondHost;
      logger.debug('vecSecondHost changed');
    }

    if (!this._IsHostSame(this.m_vecBacHost, vecBacHost)) {
      bChanged = true;
      this.m_vecBacHost = vecBacHost;
      logger.debug('vecBacHost changed');
    }

    if (bChanged) {
      this.m_iFirstIndex = 0;
      this.m_eHostType = HOST_TYPE.FIRST_HOST;

      if (this.m_vecSecondHost.length > 0) {
        this.m_iSecondIndex = 0;
      }

      if (this.m_vecBacHost.length > 0) {
        this.m_iBacIndex = 0;
      }
    }


    const vecTotalHost = this.MakeVecTotalHost(vecFirstHost, vecSecondHost, vecBacHost);
    const vecNewStrHost = [];
    for (const strHost of vecTotalHost) {
      if (!this.m_vecTotalHost.includes(strHost)) {
        vecNewStrHost.push(strHost);
      }
    }

    for (const strHost of vecNewStrHost) {
      const { ip, port } = this.GetIPandPort(strHost);
      const conf = {
        host: ip,
        port,
        user: strDBUser,
        password: strPassword,
        database: oDBConfig.m_bIsSelectDB ? strDBName : undefined,
        charset: strCharSet,
        timezone: oDBConfig.m_timezone || undefined,
        dateStrings: oDBConfig.m_dateStrings,
        connectTimeout: oDBConfig.m_connetTimeout, // 连接超时时间，ms

        acquireTimeout: oDBConfig.m_poolAcquireTimeout, // 无空闲连接时的等待超时时间
        connectionLimit: oDBConfig.m_poolConnectionLimit, // 连接池最大连接数
        connectionMinNum: oDBConfig.m_poolConnectionMinNum, // 连接池最小连接数
        // queueLimit: oDBConfig.m_poolQueueLimit, // 等待队列的数量，0代表不限制队列长度
        idleTimeout: oDBConfig.m_poolIdleTimeout,
      };
      const patternHost = makeHostPattern(strHost);
      logger.debug(`physicalGroupId[${oDBGroupConf.m_iGroupID}] add pool [${patternHost}] config: ${JSON.stringify(Object.assign({}, conf, { password: '******' }))}`);
      try {
        this.m_oPoolCluster.add(patternHost, conf);
      } catch (e) {
        console.error(`physicalGroupId[${oDBGroupConf.m_iGroupID}] add pool [${patternHost}] error`, e?.message);
        this.m_oPoolCluster.remove(patternHost);
        throw e;
      }
      this.m_vecTotalHost.push(strHost);
      this.m_mapHostInfo.set(patternHost, {
        host: strHost,
        patternHost,
        successCount: 0,
        lastSuccessTime: 0,
      });
    }
  }

  public async GetDBConnection(options: GetDBConnectionOptions): Promise<GetDBConnectionReturn> {
    const that = this;
    const { strDBUser, strPassword, strCharSet, strDBName } = options;
    const iGroupID = that.m_iGroupID;

    if (this.m_bClosed) {
      logger.error(`iGroupID[${iGroupID}] DBConnectionSelector has closed`);
      throw new Error('DBConnectionSelector has closed');
    }

    const connObj: GetDBConnectionReturn = {
      connection: null,
      strHost: '',
      hostType: HOST_TYPE.FIRST_HOST,
      lastError: null,
    };

    await that._GetDBConnection(connObj);

    if (!connObj.connection) {
      logger.debug(`physicalGroupId[${iGroupID}] DBConnectionSelector can not get connection`);
      if (connObj.lastError) {
        throw connObj.lastError;
      } else {
        throw Error(`physicalGroupId[${iGroupID}] DBConnectionSelector can not get connection`);
      }
    }

    const selHost = connObj.connection._clusterId; // 127_0_0_1_3306

    // 检查是否需要重设用户名、密码、库名、编码等参数
    await this.CheckChangeUser(connObj.connection, strDBUser, strPassword, strCharSet, strDBName);

    const useInfo = this.m_mapHostInfo.get(selHost);
    if (useInfo) {
      useInfo.successCount = useInfo.successCount + 1;
      useInfo.lastSuccessTime = Date.now();
    }
    logger.debug(`physicalGroupId[${iGroupID}] GetDBConnection selHost[${selHost}] threadId[${connObj.connection.threadId}] useInfo: ${JSON.stringify(useInfo)}`);

    this.m_iLastCallTime = Date.now(); // 标记最后一次获取连接成功的时间，便于后续的已经无用的selector的清理

    return connObj;
  }

  private async _GetDBConnection(connRet: GetDBConnectionReturn): Promise<void> {
    const that = this;
    const iGroupID = that.m_iGroupID;
    let conn = null;

    if (this.m_iFirstIndex < 0 || this.m_vecFirstHost.length === 0) {
      logger.debug(`physicalGroupId[${iGroupID}] db selector not init`);
      throw Error(`physicalGroupId[${iGroupID}] db selector not init`);
    }

    const vecFirstHost = this.m_vecFirstHost;
    const vecSecondHost = this.m_vecSecondHost;
    const vecBacHost = this.m_vecBacHost;

    logger.debug('_GetDBConnection vecFirstHost start');
    let iHostNum = vecFirstHost.length;
    for (let i = 0; i < iHostNum; i++) {
      const idx = that._GetNextFirstHostIndex(iHostNum);
      const strHost = vecFirstHost[idx];
      const patternHost = makeHostPattern(strHost);
      const ts1 = Date.now();
      try {
        conn = await that.getPatternHostConnection(this.m_oPoolCluster, strHost, patternHost);
      } catch (e) {
        connRet.lastError = e;
        logger.debug(`getPatternHostConnection vecFirstHost error: ${e?.message}`);
        // logger.debug(`getPatternHostConnection vecFirstHost error: `, e.code, e);
      }
      if (conn) {
        logger.debug(`_GetDBConnection vecFirstHost ok [${strHost}] costtime[${Date.now() - ts1}]`);
        connRet.strHost = strHost;
        connRet.hostType = HOST_TYPE.FIRST_HOST;
        connRet.connection = conn;
        return;
      }
    }

    logger.debug('_GetDBConnection vecSecondHost start');
    iHostNum = vecSecondHost.length;
    for (let i = 0; i < iHostNum; i++) {
      const idx = that._GetNextSecondHostIndex(iHostNum);
      const strHost = vecSecondHost[idx];
      const patternHost = makeHostPattern(strHost);
      const ts1 = Date.now();
      try {
        conn = await that.getPatternHostConnection(this.m_oPoolCluster, strHost, patternHost);
      } catch (e) {
        connRet.lastError = e;
        logger.debug(`getPatternHostConnection vecSecondHost error: ${e?.message}`);
        // logger.debug(`getPatternHostConnection vecSecondHost error: `, e.code, e);
      }
      if (conn) {
        logger.debug(`_GetDBConnection vecSecondHost ok [${strHost}] costtime[${Date.now() - ts1}]`);
        connRet.strHost = strHost;
        connRet.hostType = HOST_TYPE.SECOND_HOST;
        connRet.connection = conn;
        return;
      }
    }

    logger.debug('_GetDBConnection vecBacHost start');
    iHostNum = vecBacHost.length;
    for (let i = 0; i < iHostNum; i++) {
      const idx = that._GetNextBacHostIndex(iHostNum);
      const strHost = vecBacHost[idx];
      const patternHost = makeHostPattern(strHost);
      const ts1 = Date.now();
      try {
        conn = await that.getPatternHostConnection(this.m_oPoolCluster, strHost, patternHost);
      } catch (e) {
        connRet.lastError = e;
        logger.debug(`getPatternHostConnection vecBacHost error: ${e?.message}`);
        // logger.debug(`getPatternHostConnection vecBacHost error: `, e.code, e);
      }
      if (conn) {
        logger.debug(`_GetDBConnection vecBacHost ok [${strHost}] costtime[${Date.now() - ts1}]`);
        connRet.strHost = strHost;
        connRet.hostType = HOST_TYPE.BAC_HOST;
        connRet.connection = conn;
        return;
      }
    }

    // 下面尝试最后一次，选择的规则是获取成功时间最靠前的一次
    if ((vecFirstHost.length + vecSecondHost.length + vecBacHost.length) <= 1) {
      // 总数小于或等于1，就没必要再试最后一次了
      return;
    }
    let hostUseInfo: HostUseInfo = null;
    let tmpHostType = HOST_TYPE.FIRST_HOST;

    for (const strHost of vecFirstHost) {
      const patternHost = makeHostPattern(strHost);
      const tmpUseInfo = that.m_mapHostInfo.get(patternHost);
      if (!tmpUseInfo) {
        console.warn(`vecFirstHost m_mapHostInfo can not find [${patternHost}]`);
        continue;
      }

      if (!hostUseInfo) {
        hostUseInfo = tmpUseInfo;
        tmpHostType = HOST_TYPE.FIRST_HOST;
      } else {
        if (tmpUseInfo.lastSuccessTime > hostUseInfo.lastSuccessTime) {
          hostUseInfo = tmpUseInfo;
          tmpHostType = HOST_TYPE.FIRST_HOST;
        }
      }
    }

    for (const strHost of vecSecondHost) {
      const patternHost = makeHostPattern(strHost);
      const tmpUseInfo = that.m_mapHostInfo.get(patternHost);
      if (!tmpUseInfo) {
        console.warn(`vecSecondHost m_mapHostInfo can not find [${patternHost}]`);
        continue;
      }

      if (!hostUseInfo) {
        hostUseInfo = tmpUseInfo;
        tmpHostType = HOST_TYPE.SECOND_HOST;
      } else {
        if (tmpUseInfo.lastSuccessTime > hostUseInfo.lastSuccessTime) {
          hostUseInfo = tmpUseInfo;
          tmpHostType = HOST_TYPE.SECOND_HOST;
        }
      }
    }

    for (const strHost of vecBacHost) {
      const patternHost = makeHostPattern(strHost);
      const tmpUseInfo = that.m_mapHostInfo.get(patternHost);
      if (!tmpUseInfo) {
        console.warn(`vecBacHost m_mapHostInfo can not find [${patternHost}]`);
        continue;
      }

      if (!hostUseInfo) {
        hostUseInfo = tmpUseInfo;
        tmpHostType = HOST_TYPE.BAC_HOST;
      } else {
        if (tmpUseInfo.lastSuccessTime > hostUseInfo.lastSuccessTime) {
          hostUseInfo = tmpUseInfo;
          tmpHostType = HOST_TYPE.BAC_HOST;
        }
      }
    }

    if (!hostUseInfo) {
      logger.debug('_GetDBConnection m_mapHostInfo empty');
      return conn;
    }

    logger.debug(`_GetDBConnection start ForceTry [${hostUseInfo.host}]`);

    const ts1 = Date.now();
    try {
      conn = await that.getPatternHostConnection(this.m_oPoolCluster, hostUseInfo.host, hostUseInfo.patternHost);
    } catch (e) {
      connRet.lastError = e;
      logger.debug(`getPatternHostConnection ForceTry [${hostUseInfo.host}] error: ${e?.message}`);
    }
    if (conn) {
      logger.debug(`_GetDBConnection ForceTry ok [${hostUseInfo.host}] costtime[${Date.now() - ts1}]`);
      connRet.strHost = hostUseInfo.host;
      connRet.hostType = tmpHostType;
      connRet.connection = conn;
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_FORCE_TRY_CONN_SUCCESS);
      return;
    }
    OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_FORCE_TRY_CONN_FAIL);
  }

  /**
   *
   * @param strHost 127.0.0.1:3306
   * @param patternHost 127_0_0_1_3306
   */
  private removePatternHost(strHost, patternHost) {
    const iGroupID = this.m_iGroupID;
    logger.debug(`physicalGroupId[${iGroupID}] [${strHost}]-[${patternHost}] remove`);
    this.m_mapHostInfo.delete(patternHost);
    this.m_oPoolCluster.remove(patternHost);
    this.m_vecTotalHost.splice(this.m_vecTotalHost.indexOf(strHost), 1);
  }

  private getPatternHostConnection(poolCluster, strHost, patternHost) {
    const that = this;
    return new Promise((resolve, reject) => {
      logger.debug(`getPatternHostConnection try to getConnection [${strHost}]`);
      poolCluster.getConnection(patternHost, 'ORDER', (err, connection) => {
        if (err) {
          if (err.code === 'POOL_NONEONLINE' || err.code === 'POOL_NOEXIST') {
            resolve(null);
          } else if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') { // 如果是用户名或密码错误，需要剔除该pool，因为xml文件里面可能已经修改正确用户名和密码了
            that.removePatternHost(strHost, patternHost);
            reject(err);
          } else {
            reject(err);
          }
        } else {
          resolve(connection);
        }
      });
    });
  }

  private async CheckChangeUser(conn: PoolConnectionExt, strDBUser: string, strPassword: string, strCharSet: string, strDBName: string) {
    const iGroupID = this.m_iGroupID;
    const oDBConfig = this.m_dbConfig;
    const selHost = conn._clusterId;

    let bNeedChange = false;
    const changeParams: ChangeUserParams = {};

    if (conn.__user !== strDBUser) {
      bNeedChange = true;
      changeParams.user = strDBUser;
    }

    if (conn.__password !== strPassword) {
      bNeedChange = true;
      changeParams.password = strPassword;
    }

    if (oDBConfig.m_bIsSelectDB) {
      if (conn.__database !== strDBName) {
        bNeedChange = true;
        changeParams.database = strDBName;
      }
    } else {
      logger.debug(`physicalGroupId[${iGroupID}] [${selHost}] threadId[${conn.threadId}] no need check database change`);
    }

    if (conn.__charset !== strCharSet) {
      bNeedChange = true;
      changeParams.charset = strCharSet;
    }

    if (!bNeedChange) {
      logger.debug(`physicalGroupId[${iGroupID}] [${selHost}] threadId[${conn.threadId}] no changeUser`);
      return;
    }

    // 20200323 首次的时候， conn 的 __user,__password，__database,__charset 都为undefined，一定会触发一次changeUser
    // 另外如果database, charset的变化，也会频繁触发changeUser

    logger.debug(`physicalGroupId[${iGroupID}] [${selHost}] threadId[${conn.threadId}] changeUser params: ${JSON.stringify(Object.assign({}, changeParams, { password: '******' }))}`);

    // 设置用户名，密码，库名，编码等
    await new Promise((resolve, reject) => {
      conn.changeUser(changeParams, (err) => {
        if (err) {
          logger.debug(`physicalGroupId[${iGroupID}] [${selHost}] threadId[${conn.threadId}] changeUser error: ${err?.message}`);
          conn.release();
          reject(err);
        } else {
          conn.__user = strDBUser;
          conn.__password = strPassword;
          conn.__database = strDBName;
          conn.__charset = strCharSet;
          resolve();
        }
      });
    });
  }

  public GetIPandPort(strHost: string) {
    const arr = strHost.split(':');
    const [ip] = arr;
    let port = 0;
    if (arr[1] !== undefined) {
      port = parseInt(arr[1], 10);
    }
    return { ip, port };
  }

  public MakeVecTotalHost(vecFirstHost, vecSecondHost, vecBacHost) {
    const vecTotalHost = [];
    for (const item of vecFirstHost) {
      if (!vecTotalHost.includes(item)) {
        vecTotalHost.push(item);
      }
    }
    for (const item of vecSecondHost) {
      if (!vecTotalHost.includes(item)) {
        vecTotalHost.push(item);
      }
    }
    for (const item of vecBacHost) {
      if (!vecTotalHost.includes(item)) {
        vecTotalHost.push(item);
      }
    }
    return vecTotalHost;
  }

  private _IsHostSame(vecLeft: Array<string>, vecRight: Array<string>): boolean {
    if (vecLeft.length !== vecRight.length) {
      return false;
    }
    const iSize = vecLeft.length;
    for (let i = 0; i < iSize; i++) {
      if (vecLeft[i] !== vecRight[i]) {
        return false;
      }
    }
    return true;
  }

  private _GetNextFirstHostIndex(vecLen: number) {
    logger.debug(`_GetNextFirstHostIndex ${this.m_iFirstIndex}`);
    const idx = this.m_iFirstIndex;
    this.m_iFirstIndex = this.m_iFirstIndex + 1;
    this.m_iFirstIndex %= vecLen;
    return idx;
  }

  private _GetNextSecondHostIndex(vecLen: number) {
    logger.debug(`_GetNextSecondHostIndex ${this.m_iSecondIndex}`);
    const idx = this.m_iSecondIndex;
    this.m_iSecondIndex = this.m_iSecondIndex + 1;
    this.m_iSecondIndex %= vecLen;

    return idx;
  }

  private _GetNextBacHostIndex(vecLen: number) {
    logger.debug(`_GetNextBacHostIndex ${this.m_iBacIndex}`);
    const idx = this.m_iBacIndex;
    this.m_iBacIndex = this.m_iBacIndex + 1;
    this.m_iBacIndex %= vecLen;

    return idx;
  }
}

export default DBConnectionSelector;
