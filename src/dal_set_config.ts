import { DBSetConfigParams } from './dal_set_types';

export class DALSetDBConfig {
  public m_connetTimeout: number;

  public m_poolAcquireTimeout: number; // mysql2 这个库不支持，mysql支持
  public m_poolConnectionLimit: number;
  public m_poolConnectionMinNum: number;
  public m_poolQueueLimit: number; // 0-无限制
  public m_poolIdleTimeout: number; // 连接空闲的时间，超过这个时间就被关闭

  public m_removeNodeErrorCount: number;
  public m_restoreNodeTimeout: number;
  public m_canRetry: boolean;

  public m_bIsSelectDB: boolean; // 有些场景，连接数据库时并不想指定库名
  public m_timezone: string;
  public m_dateStrings: boolean;

  public constructor() {
    this.m_poolAcquireTimeout = 10 * 1000;
    this.m_poolConnectionLimit = 4;
    this.m_poolConnectionMinNum = 0;
    this.m_poolQueueLimit = 0;
    this.m_poolIdleTimeout = 30 * 1000;

    this.m_removeNodeErrorCount = 1;
    this.m_restoreNodeTimeout = 30 * 1000;
    this.m_canRetry = true;

    this.m_connetTimeout = 5 * 1000;

    this.m_bIsSelectDB = true;
    this.m_timezone = undefined;
    this.m_dateStrings = false;
  }

  public setConfig(opts: DBSetConfigParams = {}) {
    const {
      connTimeout, poolAcquireTimeout, poolConnectionLimit, poolConnectionMinNum, poolQueueLimit, poolIdleTimeout,
      removeNodeErrorCount, restoreNodeTimeout, selectDB, timezone, dateStrings,
    } = opts;
    if (connTimeout !== undefined) this.m_connetTimeout = connTimeout;

    if (poolAcquireTimeout !== undefined) this.m_poolAcquireTimeout = poolAcquireTimeout;
    if (poolConnectionLimit !== undefined) this.m_poolConnectionLimit = poolConnectionLimit;
    if (poolConnectionMinNum !== undefined) this.m_poolConnectionMinNum = poolConnectionMinNum;
    if (poolQueueLimit !== undefined) this.m_poolQueueLimit = poolQueueLimit;
    if (poolIdleTimeout !== undefined) this.m_poolIdleTimeout = poolIdleTimeout;

    if (removeNodeErrorCount !== undefined) this.m_removeNodeErrorCount = removeNodeErrorCount;
    if (restoreNodeTimeout !== undefined) this.m_restoreNodeTimeout = restoreNodeTimeout;

    if (selectDB !== undefined) this.m_bIsSelectDB = selectDB;
    if (timezone !== undefined) this.m_timezone = timezone;
    if (dateStrings !== undefined) this.m_dateStrings = dateStrings;
  }
}

export default DALSetDBConfig;
