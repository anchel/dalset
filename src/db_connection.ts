import { inheritEvents } from './util';
import { OSS_KEY_POINT, OSSATTR } from './oss_reporter';
import { GetDBConnectionReturn, HOST_TYPE, PoolConnectionExt } from './dal_set_types';
import { EventEmitter } from 'events';


export class DBConnection extends EventEmitter {
  public connection: PoolConnectionExt;
  public strHost: string;
  public hostType: HOST_TYPE;

  public constructor(connRet: GetDBConnectionReturn) {
    super();
    const { connection, strHost, hostType } = connRet;
    this.connection = connection;
    this.strHost = strHost;
    this.hostType = hostType;
    inheritEvents(connection, this, [
      'error',
      'drain',
      'connect',
      'end',
      'enqueue',
    ]);
  }

  public release() {
    return this.connection.release();
  }

  public promise() {
    return this.connection.promise();
  }

  public query(sql, params?: any, cb?: Function) {
    let tmpParams = params;
    let tmpCB = cb;
    if (typeof tmpParams === 'function') {
      tmpCB = tmpParams;
      tmpParams = undefined;
    }

    const tsStart = Date.now();
    const callback = function (err, results, fields) {
      const tsEnd = Date.now();
      // console.log('DBConnection.query callback', err, tsEnd - tsStart);
      if (err) {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_QUERY_SQL_FAIL);
      } else {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_QUERY_SQL_SUCCESS);
      }
      tmpCB?.(err, results, fields);
    };

    const paramsArr = [sql];
    if (tmpParams !== undefined) {
      paramsArr.push(tmpParams);
    }
    paramsArr.push(callback);

    // eslint-disable-next-line prefer-spread
    this.connection.query.apply(this.connection, paramsArr);
  }

  public execute(sql, params?: any, cb?: Function) {
    let tmpParams = params;
    let tmpCB = cb;
    if (typeof tmpParams === 'function') {
      tmpCB = tmpParams;
      tmpParams = undefined;
    }

    const tsStart = Date.now();
    const callback = function (err, results, fields) {
      const tsEnd = Date.now();
      // console.log('DBConnection.execute callback', err, tsEnd - tsStart);
      if (err) {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_QUERY_SQL_FAIL);
      } else {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_QUERY_SQL_SUCCESS);
      }
      tmpCB?.(err, results, fields);
    };

    const paramsArr = [sql];
    if (tmpParams !== undefined) {
      paramsArr.push(tmpParams);
    }
    paramsArr.push(callback);

    // eslint-disable-next-line prefer-spread
    this.connection.execute.apply(this.connection, paramsArr);
  }

  public beginTransaction(cb) {
    this.connection.beginTransaction((err) => {
      console.log('DBConnection.execute beginTransaction', err);
      if (err) {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_BEGIN_TRANS_FAIL);
      } else {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_BEGIN_TRANS_SUCCESS);
      }
      cb?.(err);
    });
  }

  public commit(cb) {
    this.connection.commit((err) => {
      console.log('DBConnection.execute commit', err);
      if (err) {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_COMMIT_TRANS_FAIL);
      } else {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_COMMIT_TRANS_SUCCESS);
      }
      cb?.(err);
    });
  }

  public rollback(cb) {
    this.connection.rollback((err) => {
      console.log('DBConnection.execute rollback', err);
      if (err) {
        // 没有定义回滚失败的key，也许不care吧
      } else {
        OSSATTR.Report(OSS_KEY_POINT.OSS_KEY_ROLLBACK_TRANS_SUCCESS);
      }
      cb?.(err);
    });
  }

  public destroy() {
    return this.connection.destroy();
  }

  public escape(val) {
    return this.connection.escape(val);
  }

  public escapeId(val) {
    return this.connection.escapeId(val);
  }
}

export default DBConnection;
