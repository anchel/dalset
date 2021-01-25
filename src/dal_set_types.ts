import { PoolCluster, PoolConnection } from 'mysql';

export enum CONN_TYPE {
  CONN_TYPE_FIRST_MASTER_SECOND_SLAVE = -4,  // 优先连Master可降级到指定Slave
  CONN_TYPE_SLAVE_ONLY = -3,                 // 连任意Slave（自动换连接）
  CONN_TYPE_MASTER_ONLY = -2,                // 只连Master
  CONN_TYPE_ALL = -1,                        // 连Master和任意Slave（自动换连接）
  CONN_TYPE_UNIQ_SLAVE = 0,                  // >= 0 只连Slave
  CONN_TYPE_UNSET = 100,
}

export enum SPLIT_TABLE_RULE {
  SPLIT_TABLE_RULE_BY_NUMBER = 1,
  SPLIT_TABLE_RULE_BY_MONTH_DAY = 2,
  SPLIT_TABLE_RULE_BY_YEAR_DAY = 3,
  SPLIT_TABLE_RULE_BY_MONTH = 4,
}

export enum SERVICE_TYPE {
  SERVICE_TYPE_UNKNOWN = 0,
  SERVICE_TYPE_PLATFORM = 1,
  SERVICE_TYPE_SVRKIT = 2,
}

export const SERVICE_TYPE_MAP = {
  0: SERVICE_TYPE.SERVICE_TYPE_UNKNOWN,
  1: SERVICE_TYPE.SERVICE_TYPE_PLATFORM,
  2: SERVICE_TYPE.SERVICE_TYPE_SVRKIT,
};

export class DBInstanceConf {
  public m_iReginID: number;
  public m_strHost: string;
  public m_strIP: string;
  public m_wPort: number;
  public m_iSlaveIndex: number;
  public m_iSemiSync: number;

  public constructor() {
    this.m_iReginID = 0;
    this.m_strHost = '';
    this.m_strIP = '';
    this.m_wPort = 0;
    this.m_iSlaveIndex = 0;
    this.m_iSemiSync = 0;
  }
}

export class PhysicalDBGroupConf {
  public m_iGroupID: number;
  public m_iDBHA: number;
  public m_iDBProxy: number;
  public m_oMasterConf: DBInstanceConf;
  public m_vecSlaveConf: Array<DBInstanceConf>;
  public m_vecMasterConf: Array<DBInstanceConf>; // for cdb mode
  public m_mapSlaveConf: Map<number, Array<DBInstanceConf>>;

  public constructor() {
    this.m_iGroupID = 0;
    this.m_iDBHA = 0;
    this.m_oMasterConf = new DBInstanceConf();
    this.m_oMasterConf.m_iSlaveIndex = -1;
    this.m_vecSlaveConf = [];
    this.m_vecMasterConf = [];
    this.m_mapSlaveConf = new Map();
  }
}

export class DatabaseConf {
  public m_strName: string;
  public m_strCharset: string;
  public m_iTotalNum: number;
  public m_iPaddingZero: number;
  public m_iDatabaseNumSplit: number;

  public constructor() {
    this.m_strName = '';
    this.m_strCharset = '';
    this.m_iTotalNum = 0;
    this.m_iPaddingZero = 0;
    this.m_iDatabaseNumSplit = 0;
  }
}

export class TableConf {
  public m_strName: string;
  public m_iTotalNum: number;
  public m_iPaddingZero: number;
  public m_iSplitTableRule: number;
  public m_iTableNumSplit: number;
  public m_iSqlLog: number;
  public m_iReportMMData: number;
  public m_iTableListComplete: number;
  public m_strValidTableList: string;

  public constructor() {
    this.m_strName = '';
    this.m_iTotalNum = 0;
    this.m_iPaddingZero = 0;
    this.m_iSplitTableRule = 0;
    this.m_iTableNumSplit = 0;
    this.m_iSqlLog = 0;
    this.m_iReportMMData = 0;
    this.m_iTableListComplete = 1;
    this.m_strValidTableList = '';
  }
}


export class DBGroupConf {
  public m_iIndex: number;
  public m_iPhysicalDBGroupID: number;
  public m_iTryOnSlaveFail: number;
  public m_iDBListComplete: number;
  public m_strValidDBList: string;
  public m_strBizInsertYN: string;
  public m_strGrant: string;
  public m_iBizGroup: number;
  public m_iSect: number;
  public m_iStatus: number;

  public constructor() {
    this.m_iIndex = -1;
    this.m_iPhysicalDBGroupID = -1;
    this.m_iTryOnSlaveFail = 0; // 暂时发现好像没啥作用
    this.m_iDBListComplete = 1;
    this.m_strValidDBList = '';

    this.m_strBizInsertYN = '';
    this.m_strGrant = '';
    this.m_iBizGroup = -1;
    this.m_iSect = 0;
    this.m_iStatus = 0;
  }
}

export class DBPrivilegeConf {
  public m_strServiceName: string;
  public m_iServiceType: number;
  public m_dwCmd: number;
  public m_strTableName: string;
  public m_iConnType: number;
  public m_iSlaveIndex: number;
  public m_iFailover: number; // 目前看表示同城容灾
  public m_strDBUser: string;
  public m_strEncryptDBPassword: string;
  public m_strDBPassword: string;

  public constructor() {
    this.m_strServiceName = '';
    this.m_iServiceType = 0;
    this.m_dwCmd = 0;
    this.m_strTableName = '';
    this.m_iConnType = CONN_TYPE.CONN_TYPE_MASTER_ONLY; // -2
    this.m_iSlaveIndex = -1;
    this.m_iFailover = 0;
    this.m_strDBUser = '';
    this.m_strEncryptDBPassword = '';
    this.m_strDBPassword = '';
  }
}

export class RoleSetConf {
  public m_iSetID: number;
  public m_strSetName: string;
  public m_oDatabaseConf: DatabaseConf;
  public m_mapTableConf: Map<string, TableConf>;
  public m_mapDBGroupConf: Map<number, DBGroupConf>;
  public m_mapDBPrivilegeConf: Map<string, DBPrivilegeConf>;

  public constructor() {
    this.m_iSetID = 0;
    this.m_strSetName = '';

    this.m_oDatabaseConf = new DatabaseConf();

    this.m_mapTableConf = new Map();
    this.m_mapDBGroupConf = new Map();
    this.m_mapDBPrivilegeConf = new Map();
  }
}

export enum HOST_TYPE {
  FIRST_HOST,
  SECOND_HOST,
  BAC_HOST,
}

export interface PoolConnectionExt extends PoolConnection {
  promise();

  execute();

  _clusterId: string;
  __user: string;
  __password: string;
  __database: string;
  __charset: string;
}

export interface GetDBConnectionReturn {
  connection: PoolConnectionExt;
  strHost: string;
  hostType: HOST_TYPE;
  lastError?: any;
}

export interface GetDBConnectionOptions {
  cmdId?: number;
  setId?: number;
  groupKey?: number;
  roleName: string;
  databaseKey?: number;
  databaseName?: string;
  tableBaseName: string;
}

export interface DBSetConfigParams {
  connTimeout?: number; // 数据库连接超时时间，单位毫秒
  readTimeout?: number; // 暂时无用，C++侧的变量
  writeTimeout?: number; // 暂时无用，C++侧的变量
  poolAcquireTimeout?: number; // 数据库连接池暂无可用连接时，等待的超时时间，单位毫秒
  poolConnectionLimit?: number; // 数据库连接池最大连接数
  poolConnectionMinNum?: number; // 数据库连接池最小连接数
  poolQueueLimit?: number; // 数据库连接池模式下，等待队列的最大量，超过这个时会立即返回获取连接失败，0表示无限制
  poolIdleTimeout?: number; // 连接空闲时间超过这个，则被关闭，避免连接数上去耗尽数据库连接
  removeNodeErrorCount?: number; // 连接数据库时，失败多少次就从可用节点列表剔除
  restoreNodeTimeout?: number; // 被剔除可用节点之后，多久再来探测是否可用, 单位毫秒
  selectDB?: boolean;
  timezone?: string;
  dateStrings?: boolean;
}

export interface DalSetSetConfigParams extends DBSetConfigParams {
  configureBaseDir?: string; // 配置文件目录，开发模式便于联调可以指定目录
  serviceName: string; // 当前业务模块的服务名
  virtualServiceName?: string;
  virtualServiceType?: number;
  serviceType?: SERVICE_TYPE;
  versionSuffix?: string;
  roleNames: Array<string>; // 本模块要使用的角色列表

  reloadDalFileIntervalTime?: number; // 重新加载dalset配置文件的间隔时间， 单位毫秒
  clearSelectorTimeout?: number; // 如果一个selector超过这个时间没有被调用过，则清除
  logger?: any;
}
