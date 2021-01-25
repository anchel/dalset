import { PoolConnection } from 'mysql';
import { GetDBConnectionReturn, HOST_TYPE } from './dal_set_types';
import { DBConnection } from './db_connection';

interface PromiseConnection {
  release();

  query(query, params): Promise<any>;

  execute(query, params): Promise<any>;

  end(): Promise<any>;

  beginTransaction(): Promise<any>;

  commit(): Promise<any>;

  rollback(): Promise<any>;

  ping(): Promise<any>;

  connect(): Promise<any>;
}

export class DBOperatorMysql {
  private m_bMMData: boolean;

  public connection: DBConnection;
  public getDBConnection: Function;

  public constructor(conn: DBConnection, getDBConnection: Function) {
    this.m_bMMData = false;

    this.connection = conn;
    this.getDBConnection = getDBConnection;
  }

  public SetMMData(bMMData: boolean | number) {
    this.m_bMMData = !!bMMData;
  }

  private check() {

  }

  public release() {
    return this.connection.release();
  }

  public async query(sql, params) {
    const that = this;
    this.check();

    return await new Promise((resolve, reject) => {
      const done = (err, results, fields) => {
        if (err) {
          // console.log('DBOperatorMysql.query', err);
          reject(err);
        } else {
          resolve([results, fields]);
        }
      };
      if (params !== undefined) {
        that.connection.query(sql, params, done);
      } else {
        that.connection.query(sql, done);
      }
    });
  }

  public async execute(sql, params) {
    const that = this;
    this.check();

    return await new Promise((resolve, reject) => {
      const done = (err, results, fields) => {
        if (err) {
          // console.log('DBOperatorMysql.execute', err);
          reject(err);
        } else {
          resolve([results, fields]);
        }
      };
      if (params !== undefined) {
        that.connection.execute(sql, params, done);
      } else {
        that.connection.execute(sql, done);
      }
    });
  }

  public beginTransaction() {
    const that = this;
    return new Promise((resolve, reject) => {
      that.connection.beginTransaction((err) => {
        if (err) {
          // console.log('DBOperatorMysql.beginTransaction', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public rollback() {
    const that = this;
    return new Promise((resolve, reject) => {
      that.connection.rollback((err) => {
        if (err) {
          // console.log('DBOperatorMysql.rollback', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public commit() {
    const that = this;
    return new Promise((resolve, reject) => {
      that.connection.commit((err) => {
        if (err) {
          // console.log('DBOperatorMysql.commit', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public escape(val) {
    return this.connection.escape(val);
  }

  public escapeId(val) {
    return this.connection.escapeId(val);
  }
}

export default DBOperatorMysql;
