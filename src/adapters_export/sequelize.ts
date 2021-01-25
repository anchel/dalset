import logger from '../logger';
import { DALSet } from '../dal_set';
import { PoolConnectionExt } from '../dal_set_types';
import { DBConnection } from '../db_connection';

interface DalsetOptions {
  tableBaseName: undefined | string;
  roleName: undefined | string;
}

interface ConfigOptions {
  dalsetGetConnOptions?: DalsetOptions;
}

interface GetConnectionOptions {
  type: string;
  tableNames: Array<string>;
  useMaster?: boolean;
}

export class AdapterSequelizeConnectionManager {
  public dialect: any;
  public sequelize: any;
  public config: ConfigOptions;

  public constructor(dialect, sequelize, config = {}) {
    this.dialect = dialect;
    this.sequelize = sequelize;
    this.config = config;
  }

  public async getConnection(params: GetConnectionOptions): Promise<PoolConnectionExt> {
    const options = this._getDalsetOptions(params);

    let dbConnection: DBConnection;
    const dalset = DALSet.Instance();
    try {
      dbConnection = await dalset.getDBConnection(options);
    } catch (e) {
      throw e;
    }
    return dbConnection.connection;
  }

  private _getDalsetOptions(params: GetConnectionOptions): DalsetOptions {
    const baseDalsetGetConnOptions = this.config.dalsetGetConnOptions || {};

    const options: DalsetOptions = Object.assign({ tableBaseName: undefined, roleName: undefined }, baseDalsetGetConnOptions);

    if (!options.tableBaseName && params.tableNames && params.tableNames.length) {
      // eslint-disable-next-line prefer-destructuring
      options.tableBaseName = params.tableNames[0];
    }

    if (!options.tableBaseName || !options.roleName) {
      console.error('getConn tableBaseName or roleName empty');
      throw new Error('tableBaseName or roleName can not be empty');
    }

    return options;
  }

  public releaseConnection(connection: PoolConnectionExt) {
    return connection.release();
  }

  public close() {
    // do nothing
    logger.info('AdapterSequelizeConnectionManager close');
  }

  public refreshTypeParser() {
    // do nothing
    logger.info('AdapterSequelizeConnectionManager refreshTypeParser');
  }
}

export default AdapterSequelizeConnectionManager;
