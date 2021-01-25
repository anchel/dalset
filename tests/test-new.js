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
    poolAcquireTimeout: 5000,
    poolConnectionLimit: 1,
    poolQueueLimit: 2,
    selectDB: true,
    logger,
  });

  await dalset.initialize(0, new Map());

  let arr = [];
  for (let i = 0; i < 30; i++) {
    arr.push(doQuery(dalset, i));
    // await doQuery(dalset, i);
  }

  let rets = await Promise.all(arr);

  console.log('Promise.all');
}

async function doQuery(dalset, i) {
  let oper = await dalset.getDBOperator({
    roleName: 'xnode_testrole_2_0311',
    cmdId: 0,
    setId: 0,
    groupKey: 0,
    databaseKey: 0,
    databaseName: '', // 优先级大于 databaseKey
    tableBaseName: 'T_tmp'
  });

  // let [rows] = await oper.query('select * from T_tmp limit 1');
  // console.log(i + 'rows', rows);

  // await oper.getAnotherConnection();

  // let [rows2] = await oper.query('select * from T_tmp limit 1');
  // console.log(i + 'rows2', rows2);

  try {
    let [rets] = await oper.query('update T_tmp set name = \'anchel\' where id = 40');
    console.log('rows', rets);
    oper.release();
  } catch (e) {
    console.log('doQuery', e);
    // oper.release();
  }

  console.log('doQuery finish');
  return {};
}

main().then((ret) => {
  console.log('main', ret);
}).catch((err) => {
  console.log('main err', err);
});
