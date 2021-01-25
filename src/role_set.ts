import { CONN_TYPE, DBGroupConf, DBPrivilegeConf, RoleSetConf, SERVICE_TYPE, SERVICE_TYPE_MAP, TableConf } from './dal_set_types';
import { decryptDBPassWord, getXmlNodeAttr, makeDBPrivilegeKey, trimString } from './util';
import logger from './logger';

class RoleSet {
  public m_mapRoleSetConf: Map<number, RoleSetConf>;
  public m_mapServiceType: Map<string, SERVICE_TYPE>;
  public m_bEnableBizGroup: boolean;
  public m_strDbBaseName: string;

  public constructor() {
    this.m_mapRoleSetConf = new Map();
    this.m_mapServiceType = new Map();
    this.m_bEnableBizGroup = false;
    this.m_strDbBaseName = '';
  }

  public Init(xmlJson) {
    logger.debug('RoleSet Init');
    if (!(xmlJson.DAL.RoleSetPool && xmlJson.DAL.RoleSetPool.RoleSet)) {
      logger.debug('no RoleSetPool or RoleSet node');
      throw Error('no RoleSetPool or RoleSet node');
    }

    const attrVal = getXmlNodeAttr(xmlJson.DAL.RoleSetPool, 'EnableBizGroup', parseInt);
    if (attrVal !== undefined && attrVal !== 0) {
      this.m_bEnableBizGroup = true;
    }

    xmlJson.DAL.RoleSetPool.RoleSet.each((i, item) => {
      const iSetID = getXmlNodeAttr(item, 'SetId', parseInt);
      if (this.m_mapRoleSetConf.has(iSetID)) {
        logger.debug(`role set ${iSetID} duplicate`);
        throw Error(`role set ${iSetID} duplicate`);
      }
      const oRoleSetConf = new RoleSetConf();
      oRoleSetConf.m_iSetID = iSetID;
      oRoleSetConf.m_strSetName = getXmlNodeAttr(item, 'SetName');
      this.m_mapRoleSetConf.set(iSetID, oRoleSetConf);
      this.InitExt(xmlJson, item, iSetID);
    });
  }

  public InitExt(xmlJson, xmlRoleSetNode, iSetID) {
    const roleSetConf = this.m_mapRoleSetConf.get(iSetID);

    if (!xmlRoleSetNode.Database) {
      logger.debug(`role set ${iSetID} no Database`);
      throw Error(`role set ${iSetID} no Database`);
    }
    const oDatabaseConf = roleSetConf.m_oDatabaseConf;
    oDatabaseConf.m_strName = getXmlNodeAttr(xmlRoleSetNode.Database, 'Name');
    oDatabaseConf.m_iTotalNum = getXmlNodeAttr(xmlRoleSetNode.Database, 'TotalNum', parseInt);
    oDatabaseConf.m_iPaddingZero = getXmlNodeAttr(xmlRoleSetNode.Database, 'PaddingZero', parseInt);
    oDatabaseConf.m_iDatabaseNumSplit = getXmlNodeAttr(xmlRoleSetNode.Database, 'DataBaseNumSplit', parseInt);
    oDatabaseConf.m_strCharset = getXmlNodeAttr(xmlRoleSetNode.Database, 'Charset');

    if (!this.m_strDbBaseName) {
      this.m_strDbBaseName = oDatabaseConf.m_strName;
    }
    if (!this.m_strDbBaseName) {
      logger.debug(`role set ${iSetID} m_strDbBaseName is empty`);
      throw Error(`role set ${iSetID} m_strDbBaseName is empty`);
    }
    if (this.m_strDbBaseName !== oDatabaseConf.m_strName) {
      logger.debug(`role set ${iSetID} m_strDbBaseName Different names`);
      throw Error(`role set ${iSetID} m_strDbBaseName Different names`);
    }

    if (!(xmlRoleSetNode.TableConf && xmlRoleSetNode.TableConf.Table)) {
      logger.debug(`role set ${iSetID} no TableConf or Table`);
      throw Error(`role set ${iSetID} no TableConf or Table`);
    }
    const mapTableConf = roleSetConf.m_mapTableConf;
    xmlRoleSetNode.TableConf.Table.each((i, item) => {
      let strTableName = getXmlNodeAttr(item, 'Name');
      strTableName = trimString(strTableName); // 过滤前后空格
      if (mapTableConf.has(strTableName)) {
        logger.debug(`role set ${iSetID} table: ${strTableName} duplicate`);
        throw Error(`role set ${iSetID} table: ${strTableName} duplicate`);
      }
      const oTableConf = new TableConf();
      oTableConf.m_strName = strTableName;
      oTableConf.m_iPaddingZero = getXmlNodeAttr(item, 'PaddingZero', parseInt);
      oTableConf.m_iTotalNum = getXmlNodeAttr(item, 'TotalNum', parseInt);
      oTableConf.m_iSplitTableRule = getXmlNodeAttr(item, 'SplitTableRule', parseInt);
      oTableConf.m_iTableNumSplit = getXmlNodeAttr(item, 'TableNumSplit', parseInt);
      oTableConf.m_iSqlLog = getXmlNodeAttr(item, 'SqlLog', parseInt);
      oTableConf.m_iReportMMData = getXmlNodeAttr(item, 'ReportMMData', parseInt);
      oTableConf.m_iTableListComplete = getXmlNodeAttr(item, 'TableListComplete', parseInt);
      oTableConf.m_strValidTableList = getXmlNodeAttr(item, 'VaildTableList');

      mapTableConf.set(strTableName, oTableConf);
    });


    const mapDBGroupConf = roleSetConf.m_mapDBGroupConf;
    if (!(xmlRoleSetNode.DBGroupConf && xmlRoleSetNode.DBGroupConf.DBGroup)) {
      logger.debug(`role set ${iSetID} no DBGroupConf or DBGroup node`);
      throw Error(`role set ${iSetID} no DBGroupConf or DBGroup node`);
    }
    let iGroupNum = 0;
    iGroupNum = getXmlNodeAttr(xmlRoleSetNode.DBGroupConf, 'GroupNum', parseInt);
    if (iGroupNum <= 0) {
      logger.debug(`role set ${iSetID} no DB group configure`);
      throw Error(`role set ${iSetID} no DB group configure`);
    }
    xmlRoleSetNode.DBGroupConf.DBGroup.each((i, item) => {
      const iIndex = getXmlNodeAttr(item, 'Index', parseInt);
      const oDBGroupConf = new DBGroupConf();
      oDBGroupConf.m_iIndex = iIndex;
      oDBGroupConf.m_iPhysicalDBGroupID = getXmlNodeAttr(item, 'PhysicalDBGroupID', parseInt);
      oDBGroupConf.m_iDBListComplete = getXmlNodeAttr(item, 'DBListComplete', parseInt);
      oDBGroupConf.m_iTryOnSlaveFail = getXmlNodeAttr(item, 'TryOnSlaveFail', parseInt);
      oDBGroupConf.m_strValidDBList = getXmlNodeAttr(item, 'VaildDBList');

      if (this.m_bEnableBizGroup) {
        oDBGroupConf.m_iBizGroup = getXmlNodeAttr(item, 'BizGroup', parseInt);
        oDBGroupConf.m_strBizInsertYN = getXmlNodeAttr(item, 'BizInsert');
        oDBGroupConf.m_strGrant = getXmlNodeAttr(item, 'Grant');
        oDBGroupConf.m_iSect = getXmlNodeAttr(item, 'Sect', parseInt);
        oDBGroupConf.m_iStatus = getXmlNodeAttr(item, 'Status', parseInt);
      }

      mapDBGroupConf.set(iIndex, oDBGroupConf);
    });

    if (!(xmlRoleSetNode.DBPrivilegeConf && xmlRoleSetNode.DBPrivilegeConf.Item)) {
      logger.debug(`role set ${iSetID} no DBPrivilegeConf or Item node`);
      throw Error(`role set ${iSetID} no DBPrivilegeConf or Item node`);
    }
    if (xmlRoleSetNode.DBPrivilegeConf.Item.count() <= 0) {
      logger.debug(`role set ${iSetID} no DB privilege configure`);
      throw Error(`role set ${iSetID} no DB privilege configure`);
    }
    const mapDBPrivilegeConf = roleSetConf.m_mapDBPrivilegeConf;
    xmlRoleSetNode.DBPrivilegeConf.Item.each((i, item) => {
      const oDBPrivilegeConf = new DBPrivilegeConf();
      oDBPrivilegeConf.m_strServiceName = getXmlNodeAttr(item, 'ServiceName');
      oDBPrivilegeConf.m_iServiceType = getXmlNodeAttr(item, 'ServiceType', parseInt);
      oDBPrivilegeConf.m_dwCmd = getXmlNodeAttr(item, 'CmdId', parseInt);
      oDBPrivilegeConf.m_strTableName = getXmlNodeAttr(item, 'Table');
      oDBPrivilegeConf.m_iConnType = getXmlNodeAttr(item, 'ConnType', parseInt);
      oDBPrivilegeConf.m_iFailover = getXmlNodeAttr(item, 'Failover', parseInt);
      oDBPrivilegeConf.m_strDBUser = getXmlNodeAttr(item, 'User');
      oDBPrivilegeConf.m_strEncryptDBPassword = getXmlNodeAttr(item, 'Password');

      if (oDBPrivilegeConf.m_iConnType === CONN_TYPE.CONN_TYPE_FIRST_MASTER_SECOND_SLAVE) {
        oDBPrivilegeConf.m_iSlaveIndex = getXmlNodeAttr(item, 'SlaveIndex', parseInt);
      }

      oDBPrivilegeConf.m_strServiceName = trimString(oDBPrivilegeConf.m_strServiceName);
      oDBPrivilegeConf.m_strTableName = trimString(oDBPrivilegeConf.m_strTableName);

      const strKey = makeDBPrivilegeKey(oDBPrivilegeConf.m_strServiceName, oDBPrivilegeConf.m_dwCmd, oDBPrivilegeConf.m_strTableName);
      if (mapDBPrivilegeConf.has(strKey)) {
        logger.debug(`role set ${iSetID} DB privilege[${strKey}] duplicate`);
        throw Error(`role set ${iSetID} DB privilege[${strKey}] duplicate`);
      }

      if (!oDBPrivilegeConf.m_strEncryptDBPassword) {
        oDBPrivilegeConf.m_strDBPassword = '';
      } else {
        try {
          oDBPrivilegeConf.m_strDBPassword = decryptDBPassWord(oDBPrivilegeConf.m_strEncryptDBPassword);
        } catch (e) {
          logger.debug(`role set ${iSetID} serviceName: ${oDBPrivilegeConf.m_strServiceName} DecryptDBPassWord error`, e);
          throw Error(`role set ${iSetID} serviceName: ${oDBPrivilegeConf.m_strServiceName} DecryptDBPassWord error, ${e?.message}`);
        }
      }

      mapDBPrivilegeConf.set(strKey, oDBPrivilegeConf);
      this.m_mapServiceType.set(oDBPrivilegeConf.m_strServiceName, SERVICE_TYPE_MAP[`${oDBPrivilegeConf.m_iServiceType}`]);
    });
    // logger.debug('roleSetConf', roleSetConf);
  }

  public GetNextSetConf(pconf: RoleSetConf): RoleSetConf {
    if (this.m_mapRoleSetConf.size === 0) {
      return null;
    }
    if (!pconf) {
      return this.m_mapRoleSetConf.values()[0];
    }
    let tmpConf = null;
    this.m_mapRoleSetConf.forEach((roleSetConf, iSetId) => {
      if (!tmpConf && pconf.m_iSetID > iSetId) {
        tmpConf = roleSetConf;
        return false; // stop loop
      }
    });
    return tmpConf;
  }

  public UseBizGroup(): boolean {
    return this.m_bEnableBizGroup;
  }

  public GetRoleSetConf(iSetID: number): RoleSetConf {
    return this.m_mapRoleSetConf.get(iSetID);
  }

  public HasRoleSet(iSetID: number): boolean {
    return this.m_mapRoleSetConf.has(iSetID);
  }

  public GetServiceType(strServiceName: string): SERVICE_TYPE {
    return this.m_mapServiceType.get(strServiceName) || SERVICE_TYPE.SERVICE_TYPE_UNKNOWN;
  }

  public GetDBBaseName(): string {
    return this.m_strDbBaseName;
  }

  public MatchTableName(strTableName: string, strTableBaseName: string): number {
    const dwBaseSize = strTableBaseName.length;
    if (strTableName.length < dwBaseSize) {
      return 1;
    }
    if (!strTableName.startsWith(strTableBaseName)) {
      return 2;
    }
    let bIsFind = false;
    this.m_mapRoleSetConf.forEach((roleSetConf) => {
      if (roleSetConf.m_mapTableConf.has(strTableBaseName)) {
        bIsFind = true;
        return false; // 停止循环
      }
    });
    if (!bIsFind) {
      return 3;
    }
    const strSuffix = strTableName.substring(dwBaseSize);
    if (!/^(\d|_)*$/i.test(strSuffix)) {
      return 4;
    }
    return 0;
  }
}

export default RoleSet;
