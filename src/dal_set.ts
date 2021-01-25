import { DBConnection } from './db_connection';
import { DBRole } from './db_role';
import { CONN_TYPE, DalSetSetConfigParams, DatabaseConf, DBGroupConf, GetDBConnectionOptions, RoleSetConf, SERVICE_TYPE } from './dal_set_types';
import { OSS_KEY_POINT, OSSATTR } from './oss_reporter';
import { oDBConnectionManager } from './db_connection_manager';
import { dbOperManager } from './db_operator_manager';
import { checkFileExists, getConfigDir, getFileLastModifyTime, getRoleFilePath, makeDBPrivilegeKey } from './util';

import logger, { loggerInit } from './logger';
import { DBOperatorMysql } from './db_operator';
import { DALSetDBConfig } from './dal_set_config';

import * as path from 'path';
import * as fs from 'fs';

const DAL_SET_VERSION = 'DAL_SET_VERSION 1.1.3';

let singleIns: DALSet = null;

export class DALSet {
  private m_strConfigureBaseDir: string;
  private m_strServiceName: string;
  private m_strVirtualServiceName: string;
  private m_iVirtualServiceType: number;
  private m_ddwAutoReloadTime: number;
  private m_ddwLastCheckTime: number;
  private m_mapDBRole: Map<string, DBRole>;
  private m_mapDBRoleConf: Map<string, DBRole>;
  private m_vecDBRole: Array<string>;
  private m_eServiceType: SERVICE_TYPE;
  private m_strVersionSuffix: string;
  private m_iExtLanguage: number;
  private m_bInitSuccess: boolean;
  private m_bIsStrictGroupKey: boolean;

  public m_dbConfig: DALSetDBConfig;
  public m_oPoolCluster: any;
  public m_iClearSelectorTimeout: number; // selector在此时间内未被使用，则被清除

  public constructor() {
    this.m_strConfigureBaseDir = '';
    this.m_strServiceName = '';
    this.m_strVirtualServiceName = '';
    this.m_iVirtualServiceType = -1;
    this.m_ddwAutoReloadTime = 30 * 1000;
    this.m_ddwLastCheckTime = Date.now();
    this.m_eServiceType = SERVICE_TYPE.SERVICE_TYPE_UNKNOWN;
    this.m_strVersionSuffix = '';
    this.m_iExtLanguage = 0;
    this.m_bInitSuccess = false;
    this.m_bIsStrictGroupKey = false;

    this.m_mapDBRole = new Map();
    this.m_mapDBRoleConf = new Map();
    this.m_vecDBRole = [];

    this.m_dbConfig = new DALSetDBConfig();
    this.m_oPoolCluster = null;
    this.m_iClearSelectorTimeout = 60 * 1000;
  }

  public static Instance() {
    if (!singleIns) {
      singleIns = new DALSet();
    }
    return singleIns;
  }

  public setConfig(opts: DalSetSetConfigParams) {
    const {
      configureBaseDir, serviceName, virtualServiceName, virtualServiceType,
      serviceType, versionSuffix, roleNames,
      connTimeout, readTimeout, writeTimeout,
      poolAcquireTimeout, poolConnectionLimit, poolConnectionMinNum, poolQueueLimit, poolIdleTimeout,
      removeNodeErrorCount, restoreNodeTimeout, selectDB, timezone, dateStrings,
      reloadDalFileIntervalTime, clearSelectorTimeout, logger,
    } = opts;
    if (configureBaseDir !== undefined) this.m_strConfigureBaseDir = configureBaseDir;
    if (serviceName !== undefined) this.m_strServiceName = serviceName;
    if (virtualServiceName !== undefined) this.m_strVirtualServiceName = virtualServiceName;
    if (virtualServiceType !== undefined) this.m_iVirtualServiceType = virtualServiceType;
    if (serviceType !== undefined) this.m_eServiceType = serviceType;
    if (versionSuffix !== undefined) this.m_strVersionSuffix = versionSuffix;
    if (roleNames !== undefined) this.m_vecDBRole = roleNames;
    if (reloadDalFileIntervalTime !== undefined) this.m_ddwAutoReloadTime = reloadDalFileIntervalTime;
    if (clearSelectorTimeout !== undefined) this.m_iClearSelectorTimeout = clearSelectorTimeout;

    this.m_dbConfig.setConfig(opts);

    loggerInit({ logger });
  }

  /**
   * 这里dwOSSID和mapOSSKey的参数顺序是反的
   * @param dwOSSID
   * @param mapOSSKey
   * @constructor
   */
  public async initialize(dwOSSID: number, mapOSSKey: Map<OSS_KEY_POINT, number>) {
    const that = this;
    OSSATTR.Init(that.m_strServiceName, dwOSSID, mapOSSKey);

    this.CheckParams();

    let configureBaseDir = this.m_strConfigureBaseDir;
    if (!configureBaseDir) {
      configureBaseDir = await getConfigDir();
    }
    if (!configureBaseDir) {
      logger.debug('Initialize fail, NO configureBaseDir');
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_FAIL);
      throw Error('Initialize fail, NO configureBaseDir');
    }
    this.m_strConfigureBaseDir = configureBaseDir;

    for (const roleName of this.m_vecDBRole) {
      if (that.m_mapDBRole.has(roleName)) {
        logger.debug(`Initialize fail, DB rolename[${roleName}] exists`);
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_FAIL);
        throw Error(`Initialize fail, DB rolename[${roleName}] exists`);
      }
      try {
        const poDBRole = await that._LoadDBRole(roleName);
        that.m_mapDBRole.set(roleName, poDBRole);
      } catch (e) {
        logger.error(`dalset roleName[${roleName}] load fail`);
      }
    }

    OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_SUCCESS);
    this._ReportMMData(mapOSSKey, dwOSSID);

    console.log('dalset init successfully');
    this.m_bInitSuccess = true;
  }

  private CheckParams() {
    // if (!oDBConnectionManager.IsTimeoutSet()) {
    //     logger.debug(`Initialize fail, IsTimeoutSet false`);
    //     OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_FAIL);
    //     throw Error(`Initialize fail, IsTimeoutSet false`);
    // }
    if (!this.m_strServiceName) {
      logger.debug('Initialize fail, not set service name');
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_FAIL);
      throw Error('Initialize fail, not set service name');
    }
    if (!this.m_vecDBRole.length) {
      logger.debug('Initialize fail, not set DB role');
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_INIT_FAIL);
      throw Error('Initialize fail, not set DB role');
    }
  }

  private async _LoadDBRole(roleName: string, bCheckServiceType?: boolean) {
    const configureBaseDir = this.m_strConfigureBaseDir;

    logger.debug(`configureBaseDir: ${configureBaseDir}`);
    const poDBRole = new DBRole();
    const roleFilePath = getRoleFilePath(configureBaseDir, roleName);

    try {
      await poDBRole.Init(roleFilePath, roleName);
    } catch (e) {
      logger.error('poDBRole.Init fail', e);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_LOAD_FILE_FAIL);
      throw e;
    }

    if (poDBRole.UseBizGroup()) {
      logger.debug('_LoadDBRole UseBizGroup todo');
      // todo
    }

    OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_LOAD_FILE_SUCCESS);

    return poDBRole;
  }

  public SetConfigureBaseDir(strConfigureBaseDir: string) {

  }

  public AddDBRole(strRoleName: string) {

  }

  private async _prepareParams(opts: GetDBConnectionOptions) {
    const { cmdId = 0, setId = 0, groupKey = 0, roleName, databaseKey = 0, databaseName = '', tableBaseName } = opts;

    if (!this.m_bInitSuccess) {
      logger.debug('DALSet _prepareParams fail,  init fail or not call init');
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw new Error('DALSet _prepareParams fail,  init fail or not call init');
    }

    const strRoleName = roleName;
    const dwCmd = cmdId;
    const wSetId = setId;
    let dwGroupKey = groupKey;
    const dwDatabaseKey = databaseKey;
    const strDatabaseName = databaseName;
    const strTableBaseName = tableBaseName;

    logger.debug('DALSet _prepareParams -----------------------------------------------------------------------------------');

    if (!strTableBaseName) {
      logger.debug(`DALSet _prepareParams fail,  tableBaseName is empty rolename[${strRoleName}] setid[${wSetId}] cmd[${dwCmd}] groupKey[${dwGroupKey}]`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DALSet _prepareParams fail,  tableBaseName is empty rolename[${strRoleName}] setid[${wSetId}] cmd[${dwCmd}] groupKey[${dwGroupKey}]`);
    }

    await this._CheckLoad(); // 检查配置是否需要更新

    if (!this.m_mapDBRole.has(strRoleName)) {
      logger.debug(`DB role name[${strRoleName}] has not init or init fail`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DB role name[${strRoleName}] has not init or init fail`);
    }

    const oDBRole = this.m_mapDBRole.get(strRoleName);

    if (!oDBRole.HasRoleSet(wSetId)) {
      logger.debug(`DB role name[${strRoleName}] has not set [${wSetId}]`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DB role name[${strRoleName}] has not set [${wSetId}]`);
    }

    const oRoleSetConf = oDBRole.GetRoleSetConf(wSetId);
    const strPrivilegeKey = this._GetDBPrivilegeKey(oDBRole, oRoleSetConf, dwCmd, strTableBaseName);
    if (!strPrivilegeKey) {
      logger.debug(`DB role name[${strRoleName}] setid[${wSetId}] no [service:${this.m_strServiceName} cmd:${dwCmd} table:${strTableBaseName}] privillege`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DB role name[${strRoleName}] setid[${wSetId}] no [service:${this.m_strServiceName} cmd:${dwCmd} table:${strTableBaseName}] privillege`);
    }
    const oDBPrivilegeConf = oRoleSetConf.m_mapDBPrivilegeConf.get(strPrivilegeKey);
    if (oDBPrivilegeConf.m_strServiceName !== this.m_strServiceName) {
      logger.debug(`servcie[${this.m_strServiceName}] no configure on privilege[${strPrivilegeKey}]`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`servcie[${this.m_strServiceName}] no configure on privilege[${strPrivilegeKey}]`);
    }

    if (!this.m_bIsStrictGroupKey) {
      const dwGroupNum = oRoleSetConf.m_mapDBGroupConf.size;
      dwGroupKey = dwGroupKey % dwGroupNum;
    }

    const oDBGroupConf = oRoleSetConf.m_mapDBGroupConf.get(dwGroupKey);
    if (!oDBGroupConf) {
      logger.debug(`DB role name[${strRoleName}] setid[${wSetId}] no db group[${dwGroupKey}] m_bIsStrictGroupKey[${this.m_bIsStrictGroupKey}]`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DB role name[${strRoleName}] setid[${wSetId}] no db group[${dwGroupKey}] m_bIsStrictGroupKey[${this.m_bIsStrictGroupKey}]`);
    }

    const pobjPhysicalDBGroupConf = oDBRole.GetPhysicalDBGroupConf(oDBGroupConf.m_iPhysicalDBGroupID);
    if (!pobjPhysicalDBGroupConf) {
      logger.debug(`DB role name[${strRoleName}] setid[${wSetId}] no Physical db group[${oDBGroupConf.m_iPhysicalDBGroupID}]`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DB role name[${strRoleName}] setid[${wSetId}] no Physical db group[${oDBGroupConf.m_iPhysicalDBGroupID}]`);
    }

    let strDBName = strDatabaseName;
    if (!strDBName) {
      strDBName = this._GetDatabaseName(oDBGroupConf, oRoleSetConf.m_oDatabaseConf, dwDatabaseKey);
    }

    let iConnType = oDBPrivilegeConf.m_iConnType;
    let iSlaveIndex = oDBPrivilegeConf.m_iSlaveIndex;
    const iFailover = oDBPrivilegeConf.m_iFailover;
    if (iConnType >= 0) {
      iSlaveIndex = iConnType;
      iConnType = CONN_TYPE.CONN_TYPE_UNIQ_SLAVE;
    }

    return {
      oDBRole,
      oRoleSetConf,
      pobjPhysicalDBGroupConf,
      iFailover,
      iConnType,
      iSlaveIndex,
      oDBPrivilegeConf,
      strDBName,
      strRoleName,
      strTableBaseName,
      wSetId,
      dwGroupKey,
    };
  }

  /**
   * 返回封装后的数据库connection，挂载的query，execute等方法和mysql2一致，参数里面需要传回调
   * 这个方法一般不建议给业务用，主要用在作为某些库（sequelize，nodebatis等）的适配层，这些库需要的connection需要和mysql2的一致
   * @param opts
   */
  public async getDBConnection(opts: GetDBConnectionOptions): Promise<DBConnection> {
    const prepareParamsRet = await this._prepareParams(opts);
    const {
      oDBRole,
      oRoleSetConf,
      pobjPhysicalDBGroupConf,
      iFailover,
      iConnType,
      iSlaveIndex,
      oDBPrivilegeConf,
      strDBName,
      strRoleName,
      strTableBaseName,
      wSetId,
      dwGroupKey,
    } = prepareParamsRet;

    return await dbOperManager.GetDBConnection({
      oDalset: this,
      // oDBConfig: this.m_dbConfig,
      oDBRole,
      oRoleSetConf,
      oDBGroupConf: pobjPhysicalDBGroupConf,
      iTryOnSlaveFail: iFailover,
      iConnType,
      iSlaveIndex,
      strDBUser: oDBPrivilegeConf.m_strDBUser,
      strPassword: oDBPrivilegeConf.m_strDBPassword,
      strDBName,
      strCharSet: oRoleSetConf.m_oDatabaseConf.m_strCharset,
    });
  }

  /**
   * 给业务直接使用的operator，挂载了query，execute，beginTransaction等方法，且是async方式
   * @param opts
   */
  public async getDBOperator(opts: GetDBConnectionOptions): Promise<DBOperatorMysql> {
    const { cmdId = 0, setId = 0, groupKey = 0, roleName, databaseKey = 0, databaseName = '', tableBaseName } = opts;

    const prepareParamsRet = await this._prepareParams(opts);
    const {
      oDBRole,
      oRoleSetConf,
      pobjPhysicalDBGroupConf,
      iFailover,
      iConnType,
      iSlaveIndex,
      oDBPrivilegeConf,
      strDBName,
      strRoleName,
      strTableBaseName,
      wSetId,
      dwGroupKey,
    } = prepareParamsRet;

    const dbOperatorMysql = await dbOperManager.GetDBOperator({
      oDalset: this,
      // oDBConfig: this.m_dbConfig,
      oDBRole,
      oRoleSetConf,
      oDBGroupConf: pobjPhysicalDBGroupConf,
      iTryOnSlaveFail: iFailover,
      iConnType,
      iSlaveIndex,
      strDBUser: oDBPrivilegeConf.m_strDBUser,
      strPassword: oDBPrivilegeConf.m_strDBPassword,
      strDBName,
      strCharSet: oRoleSetConf.m_oDatabaseConf.m_strCharset,
    });

    if (!dbOperatorMysql) {
      logger.debug(`DALSet DB role name[${strRoleName}] setid[${wSetId}] dwGroupKey[${dwGroupKey}] strDBName[${strDBName}] GetDBOperator null`);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_GET_DB_OP_FAIL);
      throw Error(`DALSet DB role name[${strRoleName}] setid[${wSetId}] dwGroupKey[${dwGroupKey}] strDBName[${strDBName}] GetDBOperator null`);
    }

    const oTableConf = oRoleSetConf.m_mapTableConf.get(strTableBaseName);
    if (oTableConf) {
      dbOperatorMysql.SetMMData(oTableConf.m_iReportMMData);
    } else {
      dbOperatorMysql.SetMMData(0);
    }

    return dbOperatorMysql;
  }

  private async _CheckLoad() {
    const that = this;
    const ddwLastCheckTime = this.m_ddwLastCheckTime;
    const ddwNow = Date.now();
    if (ddwNow < ddwLastCheckTime + this.m_ddwAutoReloadTime) {
      logger.debug('no need reload');
      return;
    }

    const configureBaseDir = this.m_strConfigureBaseDir;

    async function checkOneDBRole(roleName: string) {
      const oDBRole = that.m_mapDBRole.get(roleName);
      if (oDBRole) {
        const roleFilePath = getRoleFilePath(configureBaseDir, oDBRole.m_strRoleName);
        const fileExists = await checkFileExists(roleFilePath, fs.constants.R_OK);
        if (!fileExists) {
          logger.error(`role: ${oDBRole.m_strRoleName} file not exists, dangerous!!!`);
          return;
        }
        const ddwFileLastModifyTime = await getFileLastModifyTime(roleFilePath);
        if (ddwFileLastModifyTime === oDBRole.m_ddwLastModifyTime) {
          logger.debug(`role: ${oDBRole.m_strRoleName} file not modify, not reload`);
          return;
        }
        logger.debug(`role: ${oDBRole.m_strRoleName} file modified, yes reload`);
      } else {
        // 这种情况可能是首次启动的时候，该角色初始化失败
        logger.debug(`role: ${roleName} never init, yes reload`);
      }

      try {
        await that.reloadDBRole(roleName);
      } catch (e) {
        logger.error(`role: ${roleName} reload fail`);
      }
    }

    const promArr = [];
    // this.m_mapDBRole.forEach((oDBRole) => {
    //   promArr.push(checkOneDBRole(oDBRole));
    // });
    this.m_vecDBRole.forEach((roleName) => {
      promArr.push(checkOneDBRole(roleName));
    });
    await Promise.all(promArr);

    this.m_ddwLastCheckTime = ddwNow;
  }

  public async reloadDBRole(strRoleName) {
    const that = this;
    // if (!that.m_mapDBRole.has(strRoleName)) {
    //   logger.debug(`reload fail, DB role name[${strRoleName}] not exist`);
    //   OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_RELOAD_FILE_FAIL);
    //   throw Error(`reload fail, DB role name[${strRoleName}] not exist`);
    // }
    try {
      const poDBRole = await that._LoadDBRole(strRoleName);
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_RELOAD_FILE_SUCCESS);
      that.m_mapDBRole.set(strRoleName, poDBRole);
    } catch (e) {
      OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_RELOAD_FILE_FAIL);
      logger.error(`reload fail, DB role name[${strRoleName}] catch`, e);
      throw Error(`reload fail, DB role name[${strRoleName}] catch ${e?.message}`);
    }
  }

  private _GetDBPrivilegeKey(oDBRole: DBRole, oRoleSetConf: RoleSetConf, paraDwCmd: number, strTableBaseName: string) {
    let dwCmd = paraDwCmd;
    let strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, strTableBaseName);
    if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
      return strPrivilegeKey;
    }
    strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, '*');
    if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
      return strPrivilegeKey;
    }
    if (0 === dwCmd) {
      return '';
    }
    if (oDBRole.GetServiceType(this.m_strServiceName) === SERVICE_TYPE.SERVICE_TYPE_PLATFORM) {
      dwCmd = (dwCmd >> 16) & 0xFFFF;  // appplatform group cmd
      strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, strTableBaseName);
      if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
        return strPrivilegeKey;
      }
      strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, '*');
      if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
        return strPrivilegeKey;
      }
    }

    dwCmd = 0;
    strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, strTableBaseName);
    if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
      return strPrivilegeKey;
    }
    strPrivilegeKey = makeDBPrivilegeKey(this.m_strServiceName, dwCmd, '*');
    if (oRoleSetConf.m_mapDBPrivilegeConf.has(strPrivilegeKey)) {
      return strPrivilegeKey;
    }

    return '';
  }

  private _GetDatabaseName(oDBGroupConf: DBGroupConf, oDatabaseConf: DatabaseConf, dwDatabaseKey: number) {
    const strSuffix = this._GetSuffix(oDatabaseConf.m_iTotalNum, oDatabaseConf.m_iPaddingZero, dwDatabaseKey);
    return oDatabaseConf.m_strName + strSuffix;
  }

  private _GetSuffix(iTotalNum, iPaddingZero, paraDwKey) {
    let dwKey = paraDwKey;
    if (iTotalNum <= 1) {
      return '';
    }
    dwKey %= iTotalNum;
    if (0 === iPaddingZero) {
      return dwKey;
    }
    const len = Math.ceil(Math.log10(iTotalNum));
    return (`${dwKey}`).padStart(len, '0');
  }

  private _ReportMMData(mapOSSKey: Map<OSS_KEY_POINT, number>, dwOSSID: number) {
    // todo
  }

  public DALSetVersion() {
    if (!this.m_strVersionSuffix) {
      return DAL_SET_VERSION;
    }
    return `${DAL_SET_VERSION}-${this.m_strVersionSuffix}`;
  }
}

export default DALSet;
