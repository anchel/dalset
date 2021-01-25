import logger from './logger';
// eslint-disable-next-line @typescript-eslint/no-require-imports
// @ts-ignore
const { log, oss } = {};

export enum OSS_KEY_POINT {
  OSS_KEY_INIT_SUCCESS = 64,
  OSS_KEY_INIT_FAIL = 65,

  OSS_KEY_LOAD_FILE_SUCCESS = 66,
  OSS_KEY_LOAD_FILE_FAIL = 67,
  OSS_KEY_RELOAD_FILE_SUCCESS = 68,
  OSS_KEY_RELOAD_FILE_FAIL = 69,

  OSS_KEY_CONN_MYSQL_SUCCESS = 70,
  OSS_KEY_CONN_MYSQL_FAIL = 71,
  OSS_KEY_QUERY_SQL_SUCCESS = 72,
  OSS_KEY_QUERY_SQL_FAIL = 73,
  OSS_KEY_QUERY_TRY_ONE = 74,
  OSS_KEY_QUERY_TRY_TWO = 75,
  OSS_KEY_QUERY_TRY_GREATER_TWO = 76,
  OSS_KEY_RECONNECT_MYSQL = 77,

  OSS_KEY_GET_FILE_STATUS_FAIL = 78,

  OSS_KEY_GET_DB_OP_FAIL = 79,

  OSS_KEY_USE_FIRST_HOST = 80,
  OSS_KEY_USE_SAME_REGIN_SALVE = 81,
  OSS_KEY_USE_SECOND_HOST = 82,
  OSS_KEY_USE_BAC_SLAVE = 83,

  OSS_KEY_FORCE_TRY_CONN_SUCCESS = 84,
  OSS_KEY_FORCE_TRY_CONN_FAIL = 85,

  OSS_KEY_SQL_LEN_GT_1024 = 86,
  OSS_KEY_SQL_LEN_NOT_GT_1024 = 87,

  OSS_KEY_CONNECT_COST_IN_10_20_MS = 88,
  OSS_KEY_CONNECT_COST_IN_20_30_MS = 89,
  OSS_KEY_CONNECT_COST_IN_30_50_MS = 90,
  OSS_KEY_CONNECT_COST_IN_50_100_MS = 91,
  OSS_KEY_CONNECT_COST_IN_100_200_MS = 92,
  OSS_KEY_CONNECT_COST_IN_200_300_MS = 93,
  OSS_KEY_CONNECT_COST_IN_300_500_MS = 94,
  OSS_KEY_CONNECT_COST_IN_500_1000_MS = 95,
  OSS_KEY_CONNECT_COST_GT_1000_MS = 96,

  OSS_KEY_QUERY_COST_IN_10_20_MS = 97,
  OSS_KEY_QUERY_COST_IN_20_30_MS = 98,
  OSS_KEY_QUERY_COST_IN_30_50_MS = 99,
  OSS_KEY_QUERY_COST_IN_50_100_MS = 100,
  OSS_KEY_QUERY_COST_IN_100_200_MS = 101,
  OSS_KEY_QUERY_COST_IN_200_300_MS = 102,
  OSS_KEY_QUERY_COST_IN_300_500_MS = 103,
  OSS_KEY_QUERY_COST_IN_500_1000_MS = 104,
  OSS_KEY_QUERY_COST_GT_1000_MS = 105,

  OSS_KEY_GET_DB_OP_HAS_TRANS_STATE = 106,
  OSS_KEY_BEGIN_TRANS_SUCCESS = 107,
  OSS_KEY_BEGIN_TRANS_FAIL = 108,
  OSS_KEY_COMMIT_TRANS_SUCCESS = 109,
  OSS_KEY_COMMIT_TRANS_FAIL = 110,
  OSS_KEY_ROLLBACK_TRANS_SUCCESS = 111,
  OSS_KEY_CLOSE_CONNECTION_FOR_ROLLBACK_TRANS_FAIL = 112,

  OSS_KEY_FETCH_ROW_FAIL = 113,
  OSS_KEY_GET_FILED_INDEX_FAIL = 114,
  OSS_KEY_GET_AFFECTED_ROWS_FAIL = 115,
  OSS_KEY_ESCAPING_FAIL = 116,

  OSS_KEY_DUPLICATE_ENTRY = 117,

}

export class OSSReporter {
  public DEFAULT_OSS_ID: number;
  public m_strServiceName: string;
  public m_dwOSSID: number;
  public m_mapOSSKey: Map<OSS_KEY_POINT, number>;
  public m_lib: any;

  public constructor() {
    this.DEFAULT_OSS_ID = 67360;
    this.m_strServiceName = '';
    this.m_dwOSSID = 0;
    this.m_mapOSSKey = new Map();
    this.m_lib = null;
  }

  public Init(serviceName: string, dwOSSID: number, mapOSSKey: Map<OSS_KEY_POINT, number>) {
    const that = this;
    this.m_strServiceName = serviceName;
    this.m_dwOSSID = dwOSSID || this.DEFAULT_OSS_ID;

    mapOSSKey.forEach((val, key) => {
      if (val > 127) {
        // todo
      }
      that.m_mapOSSKey.set(key, val);
    });
  }

  private checkLoadLibray() {
    if (!this.m_lib) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ffi = require('ffi');
        this.m_lib = ffi.Library(
          `/home/qspace/${this.m_strServiceName}/lib64/libossattrapi`, // idkey上报的c++文件，由ffi动态加载
          {
            OssAttrInc: ['int', ['int', 'int', 'int']],
          },
        );
      } catch (e) {
        console.error('OSSReporter LoadLibray error', e?.message);
        this.m_lib = {
          OssAttrInc(ossid, idkey, val) {
            // logger.debug(`OSSReporter Report Mock ossid: ${ossid}, idkey: ${idkey}, val: ${val}`);
          },
        };
      }
    }
  }

  public Report(eOSSKeyPoint: OSS_KEY_POINT, dwValue = 1) {
    let dwIDKey = 0;
    let dwOSSID = 0;

    if (this.m_mapOSSKey.has(eOSSKeyPoint)) {
      dwIDKey = this.m_mapOSSKey.get(eOSSKeyPoint);
      dwOSSID = this.m_dwOSSID;
    } else {
      dwIDKey = eOSSKeyPoint;
      dwOSSID = this.m_dwOSSID;
    }

    logger.debug(`OSSReporter Report ossid: ${dwOSSID}, idkey: ${dwIDKey}, val: ${dwValue}`);

    // this.checkLoadLibray();

    try {
      oss.OssAttrInc(dwOSSID, dwIDKey, dwValue);
    } catch (err) {
      console.error('OSSReporter OssAttrInc error', err);
    }
  }

  public ReportConnectCost(dwCostMS: number) {

  }

  public ReportQueryCost(dwCostMS: number) {

  }
}

export const OSSATTR = new OSSReporter();
