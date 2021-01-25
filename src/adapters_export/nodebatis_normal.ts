import { DALSet } from '../dal_set';

interface DalsetOptions {
  tableBaseName: undefined | string;
  roleName: undefined | string;
}

interface ConfigOptions {
  dalsetGetConnOptions?: DalsetOptions;
}

interface ParamsOptions {
  dalsetGetConnOptions?: DalsetOptions;
}

export class AdapterNodeBatisNormalPool {
  public config: ConfigOptions;

  public constructor(config: ConfigOptions = {}) {
    this.config = config;
  }

  public async getConn(params: ParamsOptions) {
    const options = this.getDalsetOptions(params);

    let connection;
    const dalset = DALSet.Instance();
    try {
      connection = await dalset.getDBConnection(options);
    } catch (e) {
      throw e;
    }
    connection._query = connection.query;
    return connection;
  }

  public async getTransationConn(params: ParamsOptions) {
    const options = this.getDalsetOptions(params);

    let connection;
    const dalset = DALSet.Instance();
    try {
      connection = await dalset.getDBConnection(options);
    } catch (e) {
      throw e;
    }
    try {
      await new Promise((resolve, reject) => {
        connection.beginTransaction((err) => {
          if (!err) {
            resolve();
          } else {
            reject(err);
          }
        });
      });
    } catch (e) {
      this.release(connection);
      throw e;
    }
    connection._query = connection.query;
    return connection;
  }

  public commit(connection) {
    return new Promise((resolve, reject) => {
      connection.commit((err) => {
        if (!err) {
          resolve(true);
        } else {
          reject(err);
        }
      });
    });
  }

  public rollback(connection) {
    return new Promise((resolve) => {
      connection.rollback((err) => {
        if (err) {
          console.error('rollback error', err);
        }
        resolve(true);
      });
    });
  }

  public release(connection) {
    connection.release();
  }

  private getDalsetOptions(params: ParamsOptions = {}): DalsetOptions {
    const baseDalsetGetConnOptions = this.config.dalsetGetConnOptions || {};
    const { dalsetGetConnOptions = {} } = params;

    const options: DalsetOptions = Object.assign({ tableBaseName: undefined, roleName: undefined }, baseDalsetGetConnOptions, dalsetGetConnOptions);

    if (!options.tableBaseName || !options.roleName) {
      console.error('getConn tableBaseName or roleName empty');
      throw new Error('tableBaseName or roleName can not be empty');
    }

    return options;
  }
}

export default AdapterNodeBatisNormalPool;
