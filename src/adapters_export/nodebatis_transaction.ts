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

export class AdapterNodeBatisTransactionPool {
  public config: ConfigOptions;

  public constructor(cfg: ConfigOptions) {
    this.config = cfg;
  }

  public async getConnection(params: ParamsOptions = {}) {
    const baseDalsetGetConnOptions = this.config.dalsetGetConnOptions || {};
    const { dalsetGetConnOptions = {} } = params;

    const options = Object.assign({ tableBaseName: undefined, roleName: undefined }, baseDalsetGetConnOptions, dalsetGetConnOptions);
    const dalset = DALSet.Instance();
    const connection = await dalset.getDBConnection(options);
    return connection.promise();
  }
}

export default AdapterNodeBatisTransactionPool;
