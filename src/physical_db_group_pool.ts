import { DBInstanceConf, PhysicalDBGroupConf } from './dal_set_types';
import { getXmlNodeAttr, trimString } from './util';
import logger from './logger';

class PhysicalDBGroupPool {
  public m_mapPhysicalDBGroupConf: Map<number, PhysicalDBGroupConf>;

  public constructor() {
    this.m_mapPhysicalDBGroupConf = new Map();
  }

  public Init(xmlJson) {
    logger.debug('PhysicalDBGroupPool Init');
    if (!(xmlJson.DAL.PhysicalDBGroupPool && xmlJson.DAL.PhysicalDBGroupPool.PhysicalDBGroup)) {
      logger.debug('no PhysicalDBGroupPool or PhysicalDBGroup node');
      throw Error('no PhysicalDBGroupPool or PhysicalDBGroup node');
    }

    if (xmlJson.DAL.PhysicalDBGroupPool.PhysicalDBGroup.count() <= 0) {
      logger.debug('no physical dbgroup configure');
      throw Error('no physical dbgroup configure');
    }

    xmlJson.DAL.PhysicalDBGroupPool.PhysicalDBGroup.each((i, item) => {
      const iGroupID = getXmlNodeAttr(item, 'GroupId', parseInt);
      if (this.m_mapPhysicalDBGroupConf.has(iGroupID)) {
        logger.debug(`physical DB GroupId[${iGroupID}] duplicate`);
        // throw Error(`physical DB GroupId[${iGroupID}] duplicate`);
        return true;
      }

      let iDBProxy = 0;
      const tmpDBProxy = getXmlNodeAttr(item, 'DBProxy', parseInt);
      if (tmpDBProxy !== undefined) {
        iDBProxy = tmpDBProxy;
      }


      if (0 === iDBProxy) {
        this._InitDBHAGroup(xmlJson, item, iGroupID);
      } else {
        this._InitCDBGroup(xmlJson, item, iGroupID);
      }
      // logger.debug(iDBProxy, this.m_mapPhysicalDBGroupConf);
    });
  }

  private _InitDBHAGroup(xmlJson, xmlPdbNode, iGroupID) {
    const that = this;
    const oDBGroupConf = new PhysicalDBGroupConf();
    oDBGroupConf.m_iGroupID = iGroupID;
    oDBGroupConf.m_iDBProxy = 0;
    oDBGroupConf.m_iDBHA = getXmlNodeAttr(xmlPdbNode, 'DBHA', parseInt);

    if (!xmlPdbNode.Master) {
      logger.debug(`physical DB GroupId[${iGroupID}] no master configure`);
      throw Error(`physical DB GroupId[${iGroupID}] no master configure`);
    }

    const oMaterConf = oDBGroupConf.m_oMasterConf;
    oMaterConf.m_strHost = getXmlNodeAttr(xmlPdbNode.Master, 'DBHost');
    oMaterConf.m_iReginID = getXmlNodeAttr(xmlPdbNode.Master, 'IDC', parseInt);
    oMaterConf.m_iSemiSync = getXmlNodeAttr(xmlPdbNode.Master, 'SemiSync', parseInt);

    // 判断是否有从库列表
    if (xmlPdbNode.Slave && xmlPdbNode.Slave.count() > 0) {
      xmlPdbNode.Slave.each((i, item) => {
        const oSlaveConf = new DBInstanceConf();
        oSlaveConf.m_iSlaveIndex = getXmlNodeAttr(item, 'SlaveIndex', parseInt);
        oSlaveConf.m_strHost = getXmlNodeAttr(item, 'DBHost');
        oSlaveConf.m_iReginID = getXmlNodeAttr(item, 'IDC', parseInt);
        oSlaveConf.m_iSemiSync = getXmlNodeAttr(item, 'SemiSync', parseInt);
        oDBGroupConf.m_vecSlaveConf.push(oSlaveConf);
      });
    }
    that._FormatDBGroupConf(oDBGroupConf);
    that.m_mapPhysicalDBGroupConf.set(iGroupID, oDBGroupConf);
    // logger.debug(iGroupID, oDBGroupConf);
  }

  private _InitCDBGroup(xmlJson, xmlPdbNode, iGroupID) {
    const that = this;
    const oDBGroupConf = new PhysicalDBGroupConf();
    oDBGroupConf.m_iGroupID = iGroupID;
    oDBGroupConf.m_iDBProxy = 1;
    oDBGroupConf.m_iDBHA = 0;

    if (!xmlPdbNode.Master) {
      logger.debug(`physical DB GroupId[${iGroupID}] no masters configure`);
      throw Error(`physical DB GroupId[${iGroupID}] no masters configure`);
    }

    xmlPdbNode.Master.each((i, item) => {
      const oMasterConf = new DBInstanceConf();
      oMasterConf.m_strHost = getXmlNodeAttr(item, 'DBHost');
      oDBGroupConf.m_vecMasterConf.push(oMasterConf);
    });

    interface TmpObj {
      vecIDC: Array<number>;
      vecDBHost: Array<string>;
    }

    const mapSlaveIndex = new Map<number, TmpObj>();
    if (xmlPdbNode.Slave && xmlPdbNode.Slave.count() > 0) {
      xmlPdbNode.Slave.each((i, item) => {
        const iSlaveIndex = getXmlNodeAttr(item, 'SlaveIndex', parseInt);
        let tmpObj;
        if (!mapSlaveIndex.has(iSlaveIndex)) {
          tmpObj = {
            vecIDC: [],
            vecDBHost: [],
          };
          mapSlaveIndex.set(iSlaveIndex, tmpObj);
        } else {
          tmpObj = mapSlaveIndex.get(iSlaveIndex);
        }
        const tmpDBHost = getXmlNodeAttr(item, 'DBHost');
        const tmpIDC = getXmlNodeAttr(item, 'IDC', parseInt);
        tmpObj.vecDBHost.push(tmpDBHost);
        tmpObj.vecIDC.push(tmpIDC);
      });
    }
    let dwTotalSlaveNum = 0;
    mapSlaveIndex.forEach((obj, iSlaveIndex) => {
      const vecSlaveConf: Array<DBInstanceConf> = [];
      obj.vecIDC.forEach((idc, idx) => {
        const oSlaveConf = new DBInstanceConf();
        oSlaveConf.m_iSlaveIndex = iSlaveIndex;
        oSlaveConf.m_iReginID = idc;
        oSlaveConf.m_strHost = obj.vecDBHost[idx];

        vecSlaveConf.push(oSlaveConf);
      });
      dwTotalSlaveNum += vecSlaveConf.length;
      oDBGroupConf.m_mapSlaveConf.set(iSlaveIndex, vecSlaveConf);
    });

    that._FormatDBGroupConf(oDBGroupConf);
    that.m_mapPhysicalDBGroupConf.set(iGroupID, oDBGroupConf);
  }

  private _FormatDBGroupConf(oDBGroupConf: PhysicalDBGroupConf) {
    const that = this;
    const iGroupID = oDBGroupConf.m_iGroupID;
    if (oDBGroupConf.m_iDBHA) {
      if (oDBGroupConf.m_oMasterConf.m_iSemiSync === 0) {
        logger.debug(`physical DB GroupId[${iGroupID}] enable DBHA, but master disable SemiSync`);
        throw Error(`physical DB GroupId[${iGroupID}] enable DBHA, but master disable SemiSync`);
      }

      let bHasSlaveSemiSync = false;
      oDBGroupConf.m_vecSlaveConf.forEach((slaveConf) => {
        if (slaveConf.m_iSemiSync) {
          bHasSlaveSemiSync = true;
          return false;
        }
      });

      if (!bHasSlaveSemiSync && oDBGroupConf.m_vecSlaveConf.length > 0) {
        logger.debug(`physical DB GroupId[${iGroupID}] enable DBHA, but all slave disable SemiSync`);
        throw Error(`physical DB GroupId[${iGroupID}] enable DBHA, but all slave disable SemiSync`);
      }
    }

    if (0 === oDBGroupConf.m_iDBProxy) {
      oDBGroupConf.m_oMasterConf.m_strHost = trimString(oDBGroupConf.m_oMasterConf.m_strHost);
      that._FormatHost(oDBGroupConf.m_oMasterConf, iGroupID);

      oDBGroupConf.m_vecSlaveConf.forEach((slaveConf) => {
        slaveConf.m_strHost = trimString(slaveConf.m_strHost);
        that._FormatHost(slaveConf, iGroupID);
      });
    } else {
      oDBGroupConf.m_vecMasterConf.forEach((oMasterConf) => {
        oMasterConf.m_iSlaveIndex = -1;
        oMasterConf.m_strHost = trimString(oMasterConf.m_strHost);
        that._FormatHost(oMasterConf, iGroupID);
      });

      oDBGroupConf.m_mapSlaveConf.forEach((vecDBInstanceConf) => {
        vecDBInstanceConf.forEach((oSlaveConf) => {
          oSlaveConf.m_strHost = trimString(oSlaveConf.m_strHost);
          that._FormatHost(oSlaveConf, iGroupID);
        });
      });
    }
  }

  private _FormatHost(oDBInstanceConf: DBInstanceConf, iGroupID: number) {
    oDBInstanceConf.m_strHost = trimString(oDBInstanceConf.m_strHost);
    const tmpStrHostArr = oDBInstanceConf.m_strHost.split(':');
    if (tmpStrHostArr.length < 2) {
      logger.debug(`physical DB GroupId[${iGroupID}] [${oDBInstanceConf.m_strHost}] Host format error`);
      throw Error(`physical DB GroupId[${iGroupID}] [${oDBInstanceConf.m_strHost}] Host format error`);
    }
    // eslint-disable-next-line prefer-destructuring
    oDBInstanceConf.m_strIP = tmpStrHostArr[0];
    oDBInstanceConf.m_wPort = parseInt(tmpStrHostArr[1], 10);
  }

  public GetAllDBGroup(): Map<number, PhysicalDBGroupConf> {
    return this.m_mapPhysicalDBGroupConf;
  }

  public GetDBGroupConfByID(iGroupID: number): PhysicalDBGroupConf {
    return this.m_mapPhysicalDBGroupConf.get(iGroupID);
  }
}

export default PhysicalDBGroupPool;
