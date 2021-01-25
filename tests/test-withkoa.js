const log4js = require('log4js');
log4js.configure({
  appenders: { cheese: { type: 'file', filename: 'logs/cheese.log' } },
  categories: { default: { appenders: ['cheese'], level: 'info' } }
});

let DALSet = require('../lib/index').DALSet;

const logger = log4js.getLogger('cheese');

function sleep (ms = 2000) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function main () {
  let dalset = DALSet.Instance();
  dalset.setConfig({
    configureBaseDir: './tests/dalsetconf',
    serviceName: 'mmpaynodeldmmicrosampledao',
    roleNames: ['xnode_testrole_2', 'xnode_testrole_2_0311'],
    connTimeout: 2000,
    removeNodeErrorCount: 2,
    restoreNodeTimeout: 10 * 1000,
    poolConnectionLimit: 4,
    // IsSelectDB: true,
    // timezone: 'SYSTEM',
    dateStrings: true,
    logger,
  });

  await dalset.initialize(0, new Map());

  await initKoa(dalset);

}

async function initKoa(dalset) {
  const Koa = require('koa');
  const koaBody = require('koa-body');

  const app = new Koa();
  app.use(koaBody());

// response
  app.use(async ctx => {
    console.log('getDBOperator +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
    console.log('ctx.request.body', ctx.request.body);

    let {roleName, cmdId = 0, setId = 0, groupKey = 0, databaseKey = 0, databaseName, tableBaseName} = ctx.request.body;

    try {

      async function testQuery() {
        let dalset = DALSet.Instance();
        let dbOper1 = await dalset.getDBOperator({
          roleName: roleName || 'xnode_testrole_2_0311',
          cmdId: cmdId,
          setId: setId,
          groupKey: groupKey,
          databaseKey: databaseKey,
          databaseName: databaseName, // 优先级大于 databaseKey
          tableBaseName: tableBaseName
        });

        let dbConn1 = await dalset.getDBConnection({
          roleName: roleName || 'xnode_testrole_2_0311',
          cmdId: cmdId,
          setId: setId,
          groupKey: groupKey,
          databaseKey: databaseKey,
          databaseName: databaseName, // 优先级大于 databaseKey
          tableBaseName: tableBaseName
        });

        console.log('dbOper.escape(\'a " %) ', dbOper1.escape('\'a " %'));
        console.log('dbOper.escapeId(\'a " %) ', dbOper1.escapeId('\'a " %'));
        console.log('dbConn1.escape(\'a " %) ', dbConn1.escape('\'a " %'));
        console.log('dbConn1.escapeId(\'a " %) ', dbConn1.escapeId('\'a " %'));

        try {
          let [rows0] = await dbOper1.query('select * from T_tmp where id > 0 limit 10');
          console.log('query rows0', rows0);

          await new Promise((resolve, reject) => {
            dbConn1.query('select * from T_tmp where id > 0 limit 1', (err, rows, fields) => {
              if (err) {
                reject(err);
              } else {
                resolve([rows, fields]);
              }
            })
          });

          let [rows1] = await new Promise((resolve, reject) => {
            dbConn1.query('select * from T_tmp where id > ? limit 1', [0], (err, rows, fields) => {
              if (err) {
                reject(err);
              } else {
                resolve([rows, fields]);
              }
            })
          });
          console.log('query rows1', rows1);

          let promiseConn1 = dbConn1.promise();
          let [rows2] = await promiseConn1.query('select * from T_tmp where id > 0 limit 10');
          console.log('query rows2', rows2);

          // let [rows1] = await dbOper1.query('select * from T_tmp where id > ? limit 10', [0]);
          // console.log('query rows1', rows1);

          // let [rows2] = await dbOper1.execute('select * from T_tmp where id > ? limit 10', [0]);
          // console.log('execute rows2', rows2);

          // let [rows2] = await dbOper1.query('select * from T_tmp limit 10');
          // console.log('query rows2', rows2);

          // let [results] = await dbOper1.query("update T_tmp set name = 'bbb' where code = 'aaa' limit 1");
          // console.log('update results', results);

          dbOper1.release(); // 一定要记得释放
          dbConn1.release();
        } catch (e) {
          console.error('testQuery catch', e);
          dbOper1.release(); // 一定要记得释放
          dbConn1.release();
          throw e;
        }
      }

      async function testTrans () {
        let dalset = DALSet.Instance();
        let dbOper4 = await dalset.getDBOperator({
          roleName: roleName || 'xnode_testrole_2_0311',
          cmdId: cmdId,
          setId: setId,
          groupKey: groupKey,
          databaseKey: databaseKey,
          databaseName: databaseName, // 优先级大于 databaseKey
          tableBaseName: tableBaseName
        });

        try {

          console.log('开启事务');
          try {
            await dbOper4.beginTransaction();
          } catch (e) {
            console.log(`beginTransaction error`, e);
            throw e;
          }

          console.log('操作1');
          try {
            await dbOper4.query("insert into T_tmp(code, name) values('111', '222')");
          } catch (e) {
            console.log(`query1 error`, e);
            try {
              await dbOper4.rollback();
            } catch (err) {
              console.log(`rollback error`, e);
            }
            throw e;
          }

          console.log('操作2');
          try {
            await dbOper4.query("insert into T_tmp(code, name) values('333', '444')");
          } catch (e) {
            console.log(`query2 error`, e);
            try {
              await dbOper4.rollback();
            } catch (err) {
              console.log(`rollback error`, e);
            }
            throw e;
          }

          console.log('提交事务');
          try {
            await dbOper4.commit();
          } catch (e) {
            console.log(`commit error`, e);
            try {
              await dbOper4.rollback();
            } catch (err) {
              console.log(`rollback error`, e);
            }
            throw e;
          }

          dbOper4.release();
        } catch (e) {
          console.log('transaction catch ', e);
          dbOper4.release();
        }
      }

      let rows1, rows2, rows3;
      let error;
      try {

        await testQuery();

        // await testTrans();

      } catch (e) {
        console.log('catch ', e);
        error = e;
      }

      ctx.body = JSON.stringify({
        pid: process.pid,
        errmsg: error && error.message,
      });
    } catch (e) {
      console.log('koa catch error', e);
      ctx.body = JSON.stringify({
        code: e && e.code,
        message: e.message
      })
    }
  });

  app.listen(3000);
  console.log('listen 3000');
}

main().then((ret) => {
  console.log('main', ret);
}).catch((err) => {
  console.log('main err', err);
});
