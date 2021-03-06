/**
 * 为啥要新起一份 pool_cluster ，因为 mysql2的 poolCluster 还不支持 restoreNodeTimeout 选项
 */
const mysql2 = require('mysql2');
const SequelizePool = require('sequelize-pool').Pool;
const PromiseConnection = require('mysql2/promise').PromiseConnection;
// const EventEmitter = require('events').EventEmitter;
import { EventEmitter } from 'events';

function getMonotonicMilliseconds() {
  let ms;

  if (typeof process.hrtime === 'function') {
    ms = process.hrtime();
    ms = ms[0] * 1e3 + ms[1] * 1e-6;
  } else {
    ms = process.uptime() * 1000;
  }

  return Math.floor(ms);
}

function createPool(cfg) {
  // console.log('createPool------------------------------', cfg);
  const pool = new SequelizePool({
    name: 'dalset',
    create: function () {
      console.log(`SequelizePool create call ${cfg.host}:${cfg.port}`);
      const createConnectionErr = new Error();
      const connCfg = Object.assign({}, cfg);
      // 下面删除额外的属性，是为了避免mysql2的warn
      delete connCfg.connectionMinNum;
      delete connCfg.acquireTimeout;
      delete connCfg.idleTimeout;
      const coreConnection = mysql2.createConnection(connCfg);

      // 挂载兼容mysql2的PoolConnection的方法
      coreConnection.release = function () {
        pool.release(coreConnection);
      }
      coreConnection.promise = function () {
        return new PromiseConnection(coreConnection);
      }
      coreConnection.connect();
      return new Promise((resolve, reject) => {
        coreConnection.once('connect', () => {
          resolve(coreConnection);
        });
        coreConnection.once('error', err => {
          createConnectionErr.message = err.message;
          createConnectionErr.code = err.code;
          createConnectionErr.errno = err.errno;
          createConnectionErr.sqlState = err.sqlState;
          reject(createConnectionErr);
        });
      });
    },
    destroy: function (connection) {
      console.log(`SequelizePool destroy call ${cfg.host}:${cfg.port} - ${connection.threadId}`);
      return new Promise((resolve, reject) => {
        connection.end((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    validate: function (connection) {
      return connection
        && !connection._fatalError
        && !connection._protocolError
        && !connection._closing
        && !connection.stream.destroyed;
    },
    max: cfg.connectionLimit,
    min: cfg.connectionMinNum,
    idleTimeoutMillis: cfg.idleTimeout,
    acquireTimeoutMillis: cfg.acquireTimeout,
    log: false,
  });
  return pool;
}

/**
 * Selector
 */
const makeSelector = {
  RR() {
    let index = 0;
    return clusterIds => clusterIds[index++ % clusterIds.length];
  },
  RANDOM() {
    return clusterIds =>
      clusterIds[Math.floor(Math.random() * clusterIds.length)];
  },
  ORDER() {
    return clusterIds => clusterIds[0];
  }
};

class PoolNamespace {
  constructor(cluster, pattern, selector) {
    this._cluster = cluster;
    this._pattern = pattern;
    this._selector = makeSelector[selector]();
  }

  getConnection(cb) {
    const clusterNode = this._getClusterNode();
    if (clusterNode === null) {
      let err = null;

      if (this._cluster._findNodeIds(this._pattern, true).length !== 0) {
        err = new Error('Pool does not have online node.');
        err.code = 'POOL_NONEONLINE';
      } else {
        err = new Error('Pool does not exists.');
        err.code = 'POOL_NOEXIST';
      }

      return cb(err);
    }

    return this._cluster._getConnection(clusterNode, (err, connection) => {
      if (err) {
        return cb(err);
      }
      if (connection === 'retry') {
        return this.getConnection(cb);
      }
      return cb(null, connection);
    });
  }

  _getClusterNode() {
    const foundNodeIds = this._cluster._findNodeIds(this._pattern);
    if (foundNodeIds.length === 0) {
      return null;
    }
    const nodeId =
      foundNodeIds.length === 1
        ? foundNodeIds[0]
        : this._selector(foundNodeIds);
    return this._cluster._getNode(nodeId);
  }
}

class PoolCluster extends EventEmitter {
  constructor(config) {
    super();
    config = config || {};
    this._canRetry =
      typeof config.canRetry === 'undefined' ? true : config.canRetry;
    this._removeNodeErrorCount = config.removeNodeErrorCount || 5;
    this._restoreNodeTimeout = config.restoreNodeTimeout || 0;
    this._defaultSelector = config.defaultSelector || 'RR';
    this._closed = false;
    this._lastId = 0;
    this._nodes = {};
    this._serviceableNodeIds = [];
    this._namespaces = {};
    this._findCaches = {};
  }

  of(pattern, selector) {
    pattern = pattern || '*';
    selector = selector || this._defaultSelector;
    selector = selector.toUpperCase();
    if (!makeSelector[selector] === 'undefined') {
      selector = this._defaultSelector;
    }
    const key = pattern + selector;
    if (typeof this._namespaces[key] === 'undefined') {
      this._namespaces[key] = new PoolNamespace(this, pattern, selector);
    }
    return this._namespaces[key];
  }

  add(id, config) {
    if (typeof id === 'object') {
      config = id;
      id = `CLUSTER::${++this._lastId}`;
    }
    if (typeof this._nodes[id] === 'undefined') {
      this._nodes[id] = {
        id: id,
        errorCount: 0,
        // pool: new Pool({config: new PoolConfig(config)}), // 这是mysql2的pool
        pool: createPool(config),
        _offlineUntil: 0
      };
      this._serviceableNodeIds.push(id);
      this._clearFindCaches();
    }
  }

  getConnection(pattern, selector, cb) {
    let namespace;
    if (typeof pattern === 'function') {
      cb = pattern;
      namespace = this.of();
    } else {
      if (typeof selector === 'function') {
        cb = selector;
        selector = this._defaultSelector;
      }
      namespace = this.of(pattern, selector);
    }
    namespace.getConnection(cb);
  }

  end(callback) {
    const cb =
      callback !== undefined
        ? callback
        : err => {
          if (err) {
            throw err;
          }
        };
    if (this._closed) {
      process.nextTick(cb);
      return;
    }
    this._closed = true;

    let calledBack = false;
    let waitingClose = 0;
    const onEnd = err => {
      if (!calledBack && (err || --waitingClose <= 0)) {
        calledBack = true;
        return cb(err);
      }
    };

    for (const id in this._nodes) {
      waitingClose++;
      // this._nodes[id].pool.end(); // 这是mysql2的pool的写法
      const pool = this._nodes[id].pool;
      pool.drain().then(() => pool.destroyAllNow());
    }
    if (waitingClose === 0) {
      process.nextTick(onEnd);
    }
  }

  _findNodeIds(pattern, includeOffline) {
    let currentTime = 0;
    let foundNodeIds;

    if (typeof this._findCaches[pattern] !== 'undefined') {
      foundNodeIds = this._findCaches[pattern];
    }

    if (foundNodeIds === undefined) {
      if (pattern === '*') {
        // all
        foundNodeIds = this._serviceableNodeIds;
      } else if (this._serviceableNodeIds.indexOf(pattern) !== -1) {
        // one
        foundNodeIds = [pattern];
      } else {
        // wild matching
        const keyword = pattern.substring(pattern.length - 1, 0);
        foundNodeIds = this._serviceableNodeIds.filter(id =>
          id.startsWith(keyword)
        );
      }
      this._findCaches[pattern] = foundNodeIds;
    }

    if (includeOffline) {
      return foundNodeIds;
    }

    return foundNodeIds.filter(function (nodeId) {
      const node = this._getNode(nodeId);

      if (!node._offlineUntil) {
        return true;
      }

      if (!currentTime) {
        currentTime = getMonotonicMilliseconds();
      }

      return node._offlineUntil <= currentTime;
    }, this);
  }

  _getNode(id) {
    return this._nodes[id] || null;
  }

  _increaseErrorCount(node) {
    if (++node.errorCount >= this._removeNodeErrorCount) {

      if (this._restoreNodeTimeout > 0) {
        node._offlineUntil = getMonotonicMilliseconds() + this._restoreNodeTimeout;
        this.emit('offline', node.id);
        return;
      }

      const index = this._serviceableNodeIds.indexOf(node.id);
      if (index !== -1) {
        this._serviceableNodeIds.splice(index, 1);
        delete this._nodes[node.id];
        this._clearFindCaches();
        // node.pool.end(); // 这是mysql2的pool的写法
        node.pool.drain().then(() => node.pool.destroyAllNow()); // 这是sequelize-pool的写法
        this.emit('remove', node.id);
      }
    }
  }

  _decreaseErrorCount(node) {
    let errorCount = node.errorCount;

    if (errorCount > this._removeNodeErrorCount) {
      errorCount = this._removeNodeErrorCount;
    }

    if (errorCount < 1) {
      errorCount = 1;
    }

    node.errorCount = errorCount - 1;

    if (node._offlineUntil) {
      node._offlineUntil = 0;
      this.emit('online', node.id);
    }
  }

  _getConnection(node, cb) {
    node.pool.acquire().then((connection) => {
      this._decreaseErrorCount(node);

      connection._clusterId = node.id;
      return cb(null, connection);
    }, (err) => {
      this._increaseErrorCount(node);
      if (this._canRetry) {
        // REVIEW: this seems wrong?
        this.emit('warn', err);
        // eslint-disable-next-line no-console
        console.warn(`[Error] PoolCluster : ${err}`);
        return cb(null, 'retry');
      }
      return cb(err);
    });
    // node.pool.getConnection((err, connection) => {
    //   if (err) {
    //     this._increaseErrorCount(node);
    //     if (this._canRetry) {
    //       // REVIEW: this seems wrong?
    //       this.emit('warn', err);
    //       // eslint-disable-next-line no-console
    //       console.warn(`[Error] PoolCluster : ${err}`);
    //       return cb(null, 'retry');
    //     }
    //     return cb(err);
    //   }
    //   this._decreaseErrorCount(node);
    //
    //   connection._clusterId = node.id;
    //   return cb(null, connection);
    // });
  }

  _clearFindCaches() {
    this._findCaches = {};
  }
}

module.exports = PoolCluster;
