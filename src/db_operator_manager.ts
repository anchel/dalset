import { DBOperatorMysql } from './db_operator';
import { DBConnection } from './db_connection';
import { CONN_TYPE, HOST_TYPE, PhysicalDBGroupConf, RoleSetConf } from './dal_set_types';
import { DBRole } from './db_role';
import { oDBConnectionManager } from './db_connection_manager';
import { PoolConnection } from 'mysql';
import { OSS_KEY_POINT, OSSATTR } from './oss_reporter';
import logger from './logger';
import { DBConnectionSelector } from './db_connection_selector';
import { DALSetDBConfig } from './dal_set_config';
import DALSet from './dal_set';

interface GetDBOperatorOptions {
  oDalset: DALSet;
  // oDBConfig: DALSetDBConfig;
  oDBRole: DBRole;
  oRoleSetConf: RoleSetConf;
  oDBGroupConf: PhysicalDBGroupConf;
  iTryOnSlaveFail: number;
  iConnType: number;
  iSlaveIndex: number;
  strDBUser: string;
  strPassword: string;
  strDBName: string;
  strCharSet: string;
}

export class DBOperatorManager {
  /**
   * 返回DBConnection对象，几乎等价于mysql2的connection，只是在其原来的方法上，拦截加上了IDKEY上报
   * 使用方需要手动释放connection
   * @param options
   * @constructor
   */
  public async GetDBConnection(options: GetDBOperatorOptions): Promise<DBConnection> {
    logger.debug('DBOperatorManager.GetDBConnection');
    /**
     * 先获取dbconnectionselector对象
     */
    const dbConnectionSelector = await this._GetDBConnectionSelector(options);

    return await this._GetDBConnection(options, dbConnectionSelector);
  }

  /**
   * 和上面方法的区别是，进一步封装，DBOperator的api是Promise，且可以自动释放连接、自动轮换连接等
   * @param options
   * @constructor
   */
  public async GetDBOperator(options: GetDBOperatorOptions): Promise<DBOperatorMysql> {
    const that = this;
    logger.debug('DBOperatorManager.GetDBOperator');
    /**
     * 先获取dbconnectionselector对象
     */
    const dbConnectionSelector = await this._GetDBConnectionSelector(options);

    const dbConnection = await this._GetDBConnection(options, dbConnectionSelector);

    async function _tmpGetDBConnection() {
      return await that._GetDBConnection(options, dbConnectionSelector);
    }

    return new DBOperatorMysql(dbConnection, _tmpGetDBConnection);
  }

  private async _GetDBConnection(options: GetDBOperatorOptions, dbConnectionSelector: DBConnectionSelector): Promise<DBConnection> {
    const { iConnType, iTryOnSlaveFail, strDBName, strDBUser, strPassword, strCharSet } = options;

    const dbConnectionRet = await dbConnectionSelector.GetDBConnection({ strDBName, strDBUser, strPassword, strCharSet });

    switch (dbConnectionRet.hostType) {
      case HOST_TYPE.FIRST_HOST:
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_USE_FIRST_HOST);
        break;
      case HOST_TYPE.SECOND_HOST:
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_USE_SECOND_HOST);
        break;
      case HOST_TYPE.BAC_HOST:
        if (CONN_TYPE.CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
          OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_USE_BAC_SLAVE);
        } else if (iTryOnSlaveFail !== 0) {
          OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_USE_SAME_REGIN_SALVE);
        }
        break;
      default:
        break;
    }

    return new DBConnection(dbConnectionRet);
  }

  private async _GetDBConnectionSelector(options: GetDBOperatorOptions): Promise<DBConnectionSelector> {
    const { oDalset, oRoleSetConf, oDBGroupConf, iTryOnSlaveFail, iConnType, iSlaveIndex, strDBUser, strPassword, strDBName, strCharSet } = options;

    logger.debug('_GetDBConnectionSelector options', JSON.stringify({ iTryOnSlaveFail, iConnType, iSlaveIndex, strDBUser, strPassword: '******', strDBName, strCharSet }));

    const vecFirstHost = [];
    const vecSecondHost = [];
    const vecBacHost = [];

    this._GetConnHost(
      oDBGroupConf, iConnType, iSlaveIndex,
      iTryOnSlaveFail, vecFirstHost, vecSecondHost, vecBacHost,
    );

    logger.debug('vecFirstHost  -', vecFirstHost);
    logger.debug('vecSecondHost -', vecSecondHost);
    logger.debug('vecBacHost    -', vecBacHost);

    if (vecFirstHost.length === 0) {
      logger.debug(`physicalGroupId[${oDBGroupConf.m_iGroupID}] iConnType[${iConnType}] iSlaveIndex[${iSlaveIndex}] iTryOnSlaveFail[${iTryOnSlaveFail}] first host is empty`);
      throw Error(`physicalGroupId[${oDBGroupConf.m_iGroupID}] iConnType[${iConnType}] iSlaveIndex[${iSlaveIndex}] iTryOnSlaveFail[${iTryOnSlaveFail}] first host is empty`);
    }

    return await oDBConnectionManager.GetDBConnectionSelector({ oDalset, oDBGroupConf, oRoleSetConf, iConnType, iSlaveIndex, iTryOnSlaveFail, vecFirstHost, vecSecondHost, vecBacHost, strDBUser, strPassword, strDBName, strCharSet });
  }

  private _GetConnHost(
    oDBGroupConf: PhysicalDBGroupConf, iConnType: number, iSlaveIndex: number, iTryOnSlaveFail: number,
    vecFirstHost: Array<string>, vecSecondHost: Array<string>, vecBacHost: Array<string>,
  ) {
    if (oDBGroupConf.m_iDBProxy) {
      this._GetCDBConnHost(
        oDBGroupConf, iConnType, iSlaveIndex, iTryOnSlaveFail,
        vecFirstHost, vecSecondHost, vecBacHost,
      );
    } else {
      this._GetDBHAConnHost(
        oDBGroupConf, iConnType, iSlaveIndex, iTryOnSlaveFail,
        vecFirstHost, vecSecondHost, vecBacHost,
      );
    }
  }

  private _GetDBHAConnHost(
    oDBGroupConf: PhysicalDBGroupConf, iConnType: number, iSlaveIndex: number, iTryOnSlaveFail: number,
    vecFirstHost: Array<string>, vecSecondHost: Array<string>, vecBacHost: Array<string>,
  ) {
    const { CONN_TYPE_MASTER_ONLY, CONN_TYPE_FIRST_MASTER_SECOND_SLAVE, CONN_TYPE_SLAVE_ONLY, CONN_TYPE_UNIQ_SLAVE, CONN_TYPE_ALL, CONN_TYPE_UNSET } = CONN_TYPE;
    // 包含指定的一个Slave
    if (CONN_TYPE.CONN_TYPE_UNIQ_SLAVE === iConnType || CONN_TYPE.CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
      logger.debug('包含指定的一个Slave');
      const iSlaveNum = oDBGroupConf.m_vecSlaveConf.length;
      if (iSlaveIndex >= iSlaveNum || iSlaveIndex < 0) {
        logger.debug(`CONN_TYPE_UNIQ_SLAVE, slave index[${iSlaveIndex}] error`);
        throw Error(`CONN_TYPE_UNIQ_SLAVE, slave index[${iSlaveIndex}] error`);
      }
    }
    // 包含Master
    if (CONN_TYPE_MASTER_ONLY === iConnType || CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
      logger.debug('包含Master');
      if (0 === oDBGroupConf.m_iDBHA) {
        vecFirstHost.push(oDBGroupConf.m_oMasterConf.m_strHost);
      } else {
        this._MakeDBHAConnHost(oDBGroupConf, CONN_TYPE_FIRST_MASTER_SECOND_SLAVE, vecFirstHost, vecSecondHost);
      }

      if (CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
        const oSlaveConf = oDBGroupConf.m_vecSlaveConf[iSlaveIndex];
        if (0 === oDBGroupConf.m_iDBHA) {
          vecBacHost.push(oSlaveConf.m_strHost);
        } else {
          this._MakeDBHAConnHost(oDBGroupConf, iSlaveIndex, vecBacHost, vecBacHost);
        }
      }
    } else if (CONN_TYPE_UNIQ_SLAVE === iConnType) { // 只包含单个Slave
      logger.debug('只包含单个Slave');
      const oSlaveConf = oDBGroupConf.m_vecSlaveConf[iSlaveIndex];
      if (0 === oDBGroupConf.m_iDBHA) {
        vecFirstHost.push(oSlaveConf.m_strHost);
      } else {
        this._MakeDBHAConnHost(oDBGroupConf, iSlaveIndex, vecFirstHost, vecSecondHost);
      }

      if (iTryOnSlaveFail) {
        const iReginID = oDBGroupConf.m_vecSlaveConf[iSlaveIndex].m_iReginID;
        const iSlaveNum = oDBGroupConf.m_vecSlaveConf.length;
        for (let i = 0; i < iSlaveNum; ++i) {
          if (i === iSlaveIndex) continue;

          if (iReginID !== oDBGroupConf.m_vecSlaveConf[i].m_iReginID) continue;

          const oSlaveConf = oDBGroupConf.m_vecSlaveConf[i];
          if (0 === oDBGroupConf.m_iDBHA) {
            vecBacHost.push(oSlaveConf.m_strHost);
          } else {
            this._MakeDBHAConnHost(oDBGroupConf, i, vecBacHost, vecBacHost);
          }
        }
      }
    } else if (CONN_TYPE_SLAVE_ONLY === iConnType || CONN_TYPE_ALL === iConnType) { // 任意Slave，可能包括Master
      logger.debug('任意Slave，可能包含Master');
      const iSlaveNum = oDBGroupConf.m_vecSlaveConf.length;
      for (let i = 0; i < iSlaveNum; ++i) {
        const oSlaveConf = oDBGroupConf.m_vecSlaveConf[i];
        if (0 === oDBGroupConf.m_iDBHA) {
          vecFirstHost.push(oSlaveConf.m_strHost);
        } else {
          this._MakeDBHAConnHost(oDBGroupConf, i, vecFirstHost, vecSecondHost);
        }
      }

      if (CONN_TYPE_ALL === iConnType) { // 包含Master
        if (0 === oDBGroupConf.m_iDBHA) {
          vecFirstHost.push(oDBGroupConf.m_oMasterConf.m_strHost);
        } else {
          this._MakeDBHAConnHost(oDBGroupConf, CONN_TYPE_ALL, vecFirstHost, vecSecondHost);
        }
      }
    } else {
      logger.debug(`connType[${iConnType}] not support`);
      throw Error(`connType[${iConnType}] not support`);
    }
  }

  private _GetCDBConnHost(
    oDBGroupConf: PhysicalDBGroupConf, iConnType: number, iSlaveIndex: number, iTryOnSlaveFail: number,
    vecFirstHost: Array<string>, vecSecondHost: Array<string>, vecBacHost: Array<string>,
  ) {
    const { CONN_TYPE_MASTER_ONLY, CONN_TYPE_FIRST_MASTER_SECOND_SLAVE, CONN_TYPE_SLAVE_ONLY, CONN_TYPE_UNIQ_SLAVE, CONN_TYPE_ALL, CONN_TYPE_UNSET } = CONN_TYPE;

    if (CONN_TYPE_UNIQ_SLAVE === iConnType || CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
      if (!oDBGroupConf.m_mapSlaveConf.has(iSlaveIndex) || iSlaveIndex < 0) {
        logger.debug(`CONN_TYPE_UNIQ_SLAVE, slave index[${iSlaveIndex}] error`);
      }
    }

    if (CONN_TYPE_MASTER_ONLY === iConnType || CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
      let iIndex = 0;
      for (const item of oDBGroupConf.m_vecMasterConf) {
        if (0 === iIndex) {
          vecFirstHost.push(item.m_strHost);
        } else {
          vecSecondHost.push(item.m_strHost);
        }
        iIndex = iIndex + 1;
      }

      if (CONN_TYPE_FIRST_MASTER_SECOND_SLAVE === iConnType) {
        const dbicArr = oDBGroupConf.m_mapSlaveConf.get(iSlaveIndex);
        if (dbicArr) {
          for (const itIns of dbicArr) {
            vecBacHost.push(itIns.m_strHost);
          }
        }
      }
    } else if (CONN_TYPE_UNIQ_SLAVE === iConnType) {
      let iReginID = -1;
      const dbicArr = oDBGroupConf.m_mapSlaveConf.get(iSlaveIndex);
      if (dbicArr) {
        const iIndex = 0;
        for (const itIns of dbicArr) {
          if (0 === iIndex) {
            vecFirstHost.push(itIns.m_strHost);
            iReginID = itIns.m_iReginID;
          } else {
            vecSecondHost.push(itIns.m_strHost);
          }
        }
      }
      if (iTryOnSlaveFail && iReginID !== -1) {
        oDBGroupConf.m_mapSlaveConf.forEach((tmpDbicArr, tmpIndex) => {
          if (iSlaveIndex === tmpIndex) {
            return;
          }
          for (const itIns of tmpDbicArr) {
            if (itIns.m_iReginID === iReginID) {
              vecBacHost.push(itIns.m_strHost);
            }
          }
        });
      }
    } else if (CONN_TYPE_SLAVE_ONLY === iConnType || CONN_TYPE_ALL === iConnType) {
      let iIndex = 0;
      oDBGroupConf.m_mapSlaveConf.forEach((tmpDbicArr) => {
        iIndex = 0;
        for (const itIns of tmpDbicArr) {
          if (0 === iIndex) {
            vecFirstHost.push(itIns.m_strHost);
          } else {
            vecSecondHost.push(itIns.m_strHost);
          }

          iIndex = iIndex + 1;
        }
      });

      if (CONN_TYPE_ALL === iConnType) {
        iIndex = 0;
        for (const tmpItem of oDBGroupConf.m_vecMasterConf) {
          if (0 === iIndex) {
            vecFirstHost.push(tmpItem.m_strHost);
          } else {
            vecSecondHost.push(tmpItem.m_strHost);
          }

          iIndex = iIndex + 1;
        }
      }
    } else {
      logger.debug(`connType[${iConnType}] not support`);
      throw Error(`connType[${iConnType}] not support`);
    }
  }

  private _MakeDBHAConnHost(oDBGroupConf: PhysicalDBGroupConf, iSlaveIndex: number, vecFirstHost: Array<string>, vecSecondHost: Array<string>) {
    const that = this;
    let iReginID = 0;
    if (iSlaveIndex < 0) {
      iReginID = oDBGroupConf.m_oMasterConf.m_iReginID;
    } else {
      iReginID = oDBGroupConf.m_vecSlaveConf[iSlaveIndex].m_iReginID;
    }

    let wSlavePort = 0;
    const iSlaveNum = oDBGroupConf.m_vecSlaveConf.length;

    for (let i = 0; i < iSlaveNum; ++i) {
      if (iSlaveIndex === i) {
        continue;
      }
      const oSlaveConf = oDBGroupConf.m_vecSlaveConf[i];
      wSlavePort = this._MakeDBHAPort(oSlaveConf.m_wPort, iSlaveIndex);
      const strHost = `${oSlaveConf.m_strIP}:${wSlavePort}`;
      if (iReginID === oSlaveConf.m_iReginID) {
        vecSecondHost.unshift(strHost);
      } else {
        vecSecondHost.push(strHost);
      }
    }

    const oMasterConf = oDBGroupConf.m_oMasterConf;
    if (iSlaveIndex < 0) {
      const wMasterPort = this._MakeDBHAPort(oMasterConf.m_wPort, iSlaveIndex);
      vecFirstHost.push(`${oMasterConf.m_strIP}:${wMasterPort}`);
    } else {
      const oSlaveConf = oDBGroupConf.m_vecSlaveConf[iSlaveIndex];
      wSlavePort = this._MakeDBHAPort(oSlaveConf.m_wPort, iSlaveIndex);
      vecFirstHost.push(`${oSlaveConf.m_strIP}:${wSlavePort}`);

      vecSecondHost.push(`${oMasterConf.m_strIP}:${wSlavePort}`);
    }
  }

  private _MakeDBHAPort(wBasePort: number, iSlaveIndex: number) {
    let tmpSlaveIndex = iSlaveIndex;
    if (tmpSlaveIndex < 0) {
      return wBasePort + 100;
    }

    tmpSlaveIndex += 2;

    return wBasePort + (tmpSlaveIndex * 100);
  }
}

export const dbOperManager = new DBOperatorManager();

