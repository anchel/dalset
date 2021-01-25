import { CONN_TYPE, GetDBConnectionReturn, PhysicalDBGroupConf, RoleSetConf } from './dal_set_types';
import { DBOperatorMysql } from './db_operator';
import { DBConnectionSelector } from './db_connection_selector';
import logger from './logger';
import { DALSetDBConfig } from './dal_set_config';
import DALSet from './dal_set';

interface GetDBConecctionOptions {
  pDBOperMysql: DBOperatorMysql;
  oDBConfig: DALSetDBConfig;
  oDBGroupConf: PhysicalDBGroupConf;
  oRoleSetConf: RoleSetConf;

  iConnType: number;
  iSlaveIndex: number;
  iTryOnSlaveFail: number;

  vecFirstHost: Array<string>;
  vecSecondHost: Array<string>;
  vecBacHost: Array<string>;

  strDBUser: string;
  strPassword: string;
  strDBName: string;
  strCharSet: string;
}

interface GetDBConecctionSlectorOptions {
  oDalset: DALSet;
  // oDBConfig: DALSetDBConfig;
  oDBGroupConf: PhysicalDBGroupConf;
  oRoleSetConf: RoleSetConf;

  iConnType: number;
  iSlaveIndex: number;
  iTryOnSlaveFail: number;

  vecFirstHost: Array<string>;
  vecSecondHost: Array<string>;
  vecBacHost: Array<string>;

  strDBUser: string;
  strPassword: string;
  strDBName: string;
  strCharSet: string;
}

class DBConnectionManager {
  public m_mapDBConnectionSelector: Map<string, DBConnectionSelector>;

  public constructor() {
    this.m_mapDBConnectionSelector = new Map<string, DBConnectionSelector>();
  }

  public async GetDBConnectionSelector(options: GetDBConecctionSlectorOptions): Promise<DBConnectionSelector> {
    const that = this;
    const { oDalset, oDBGroupConf, iConnType, iSlaveIndex, iTryOnSlaveFail, vecFirstHost, vecSecondHost, vecBacHost, strDBName, strDBUser, strPassword, strCharSet } = options;
    const iGroupID = oDBGroupConf.m_iGroupID;

    /**
     * 清理一定时间内没有使用的selector
     * selector由物理组ID，连接类型，从库编号，用户名等几要素来确定一个selector，当其中任何一个要素发生改变，都会触发新建selector
     */
    this._clearUnusedSelector(options);

    /**
     *
     * 在申请服务对role的权限时，要选set以及设置用户名密码。如果紧紧针对一个物理组，获取出来的connection后，再去修改数据库名、用户名和密码，可能会有如下问题：
     * 1、物理组是不是唯一的，虽然初步判断是唯一的，即和角色无关
     * 2、在获取的connection上，实时修改库名，用户名和密码等，是否有影响，初步判断无影响，只是会多一次sql操作
     */
    const strKey = this._MakeDBSelectorItemKey(oDBGroupConf.m_iGroupID, iTryOnSlaveFail, iConnType, iSlaveIndex, strDBUser, strPassword);
    let oDBConnectionSelector: DBConnectionSelector = this.m_mapDBConnectionSelector.get(strKey);
    if (!oDBConnectionSelector) {
      if (!oDalset.m_oPoolCluster) {
        logger.debug(`physicalGroupId[${iGroupID}] createPoolCluster`);
        oDalset.m_oPoolCluster = that.createPoolCluster(oDalset.m_dbConfig);
      }
      oDBConnectionSelector = new DBConnectionSelector(oDalset.m_oPoolCluster, iGroupID, oDalset.m_dbConfig);
      this.m_mapDBConnectionSelector.set(strKey, oDBConnectionSelector);
      logger.debug(`physicalGroupId[${iGroupID}] add DBConnectionSelector`);
    }

    logger.debug(`physicalGroupId[${iGroupID}] accept vecTotalHost:${JSON.stringify(oDBConnectionSelector.MakeVecTotalHost(vecFirstHost, vecSecondHost, vecBacHost))}`);

    oDBConnectionSelector.Init({ oDBGroupConf, vecFirstHost, vecSecondHost, vecBacHost, strDBName, strDBUser, strPassword, strCharSet });

    return oDBConnectionSelector;
  }

  private _clearUnusedSelector(options: GetDBConecctionSlectorOptions) {
    const { oDalset } = options;
    const removeKeys = [];
    this.m_mapDBConnectionSelector.forEach((selector, key) => {
      const lastCallTime = selector.m_iLastCallTime;
      if ((Date.now() - lastCallTime) > oDalset.m_iClearSelectorTimeout) {
        removeKeys.push(key);
      }
    });
    for (const key of removeKeys) {
      logger.debug(`remove dbconnectionselector ${key}`);
      const selector = this.m_mapDBConnectionSelector.get(key);
      this.m_mapDBConnectionSelector.delete(key);
      selector.Close();
    }
  }

  private createPoolCluster(oDBConfig: DALSetDBConfig) {
    const that = this;
    const poolCluster = that._createPoolCluster({
      canRetry: oDBConfig.m_canRetry,
      removeNodeErrorCount: oDBConfig.m_removeNodeErrorCount,
      restoreNodeTimeout: oDBConfig.m_restoreNodeTimeout,
      defaultSelector: 'ORDER',
    });

    return poolCluster;
  }

  private _createPoolCluster = function (config) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PoolCluster = require('./mysql/pool_cluster.js');
    return new PoolCluster(config);
  };

  private _MakeDBSelectorItemKey(
    iPhysicalDBGroupID: number, iTryOnSlaveFail: number, iConnType: number, iSlaveIndex: number,
    strDBUser: string, strPassword: string,
  ) {
    let tmpSlaveIndex = iSlaveIndex;
    if (iConnType !== CONN_TYPE.CONN_TYPE_UNIQ_SLAVE && iConnType !== CONN_TYPE.CONN_TYPE_FIRST_MASTER_SECOND_SLAVE) {
      tmpSlaveIndex = 0;
    }
    return [iPhysicalDBGroupID, iTryOnSlaveFail, iConnType, tmpSlaveIndex, strDBUser, strPassword].join(' ');
  }
}

export const oDBConnectionManager = new DBConnectionManager();

export default oDBConnectionManager;
