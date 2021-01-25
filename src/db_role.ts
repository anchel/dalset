import { xmlPath2json, getXmlNodeAttr, getFileLastModifyTime } from './util';

import RoleSet from './role_set';
import PhysicalDBGroupPool from './physical_db_group_pool';
import { RoleSetConf, SERVICE_TYPE } from './dal_set_types';
import logger from './logger';

import * as path from 'path';

export class DBRole {
  public m_strRoleName: string;
  public m_iVersion: number;
  public m_ddwLastModifyTime: number;
  public m_ddwCheckLoadTime: number;
  public m_oPhysicalDBGroupPool: PhysicalDBGroupPool;
  public m_oRoleSet: RoleSet;

  public constructor() {
    // let {roleName, version, lastModifyTime, checkLoadTime} = opts;
    this.m_strRoleName = '';
    this.m_iVersion = 0;
    this.m_ddwLastModifyTime = 0;
    this.m_ddwCheckLoadTime = 0;

    this.m_oPhysicalDBGroupPool = new PhysicalDBGroupPool();
    this.m_oRoleSet = new RoleSet();
  }

  public async Init(strFilePath, strRoleName) {
    const xmlFileFullPath = path.resolve(process.cwd(), strFilePath);
    this.m_ddwLastModifyTime = await getFileLastModifyTime(xmlFileFullPath);

    const xmlJson: any = await xmlPath2json(xmlFileFullPath);

    this.m_strRoleName = getXmlNodeAttr(xmlJson.DAL, 'RoleName');
    this.m_iVersion = getXmlNodeAttr(xmlJson.DAL, 'Version', parseInt);

    if (strRoleName !== this.m_strRoleName) {
      logger.debug(`role name not equal, [${strRoleName}], [${this.m_strRoleName}]`);
      throw Error(`role name not equal, [${strRoleName}], [${this.m_strRoleName}]`);
    }

    this.m_oPhysicalDBGroupPool.Init(xmlJson);
    this.m_oRoleSet.Init(xmlJson);

    this.m_ddwCheckLoadTime = Date.now();
  }

  public GetNextSetConf(pconf: RoleSetConf): RoleSetConf {
    return this.m_oRoleSet.GetNextSetConf(pconf);
  }

  public GetRoleSetConf(iSetID): RoleSetConf {
    return this.m_oRoleSet.GetRoleSetConf(iSetID);
  }

  public UseBizGroup(): boolean {
    return this.m_oRoleSet.UseBizGroup();
  }

  public HasRoleSet(iSetID): boolean {
    return this.m_oRoleSet.HasRoleSet(iSetID);
  }

  public GetServiceType(strServiceName): SERVICE_TYPE {
    return this.m_oRoleSet.GetServiceType(strServiceName);
  }

  public GetPhysicalDBGroupConf(iPhysicalDBGroupID) {
    return this.m_oPhysicalDBGroupPool.GetDBGroupConfByID(iPhysicalDBGroupID);
  }

  public GetDBBaseName(): string {
    return this.m_oRoleSet.GetDBBaseName();
  }

  public MatchTableName(strTableName, strTableBaseName) {
    return this.m_oRoleSet.MatchTableName(strTableName, strTableBaseName);
  }
}

export default DBRole;
