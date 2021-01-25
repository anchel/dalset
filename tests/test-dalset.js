const dalset = require('../index').dalset;
const {setConfig, init, GetDBOperator, CMySqlStorage} = dalset;

async function main () {
  console.log('dalset main');
  init({
    serviceName: 'mmpaynodeldmmicrosampledao',
    roleNames: ['xnode_testrole', 'xnode_testrole_2'],
    configureBaseDir: './tests/dalsetconf',
    connTimeout: 1
  });

  // let dbOperator = GetDBOperator({cmdId: 0, groupKey: 0, roleName: 'xnode_testrole', tableName: 'T_tmp', setId: 0, databaseKey: 0, databaseName: ''});
  let dbOperator = await GetDBOperator({cmdId: 0, groupKey: 0, roleName: 'xnode_testrole_2', tableName: 'T_tmp', setId: 0, databaseKey: 0});
  let dalStorage = new CMySqlStorage();
  dalStorage.SetDBOperator(dbOperator);

  let rows = await dalStorage.QueryForResultSet('select * from T_tmp limit 10');
  console.log('rows', rows);

  /*
  let sqlArr = [];
  sqlArr.push("insert into T_tmp(code, name, birthday) values('aaa', 'dogsir', '2019/11/28 19:37:04')");
  sqlArr.push("insert into T_tmp(code, name, birthday) values('bbb', 'dogsir', '2019/11/28 19:37:04')");
  let ret = dalStorage.Execute(sqlArr.slice(0, 1).join(';'));
  console.log('insert', ret, dalStorage.GetAffectedRows());

  ret = dalStorage.Execute("update T_tmp set name='dogsir-update' where id=1");
  console.log('update', ret, dalStorage.GetAffectedRows());

  ret = dalStorage.Execute("delete from T_tmp where name='dogsir-update'");
  console.log('dalete', ret, dalStorage.GetAffectedRows());

   */
  /**
  try {
    dalStorage.BeginTransaction();

    ret = dalStorage.Execute(sqlArr.slice(0, 1).join(';'));
    console.log('multi-111', ret, dalStorage.GetAffectedRows());
    ret = dalStorage.Execute(sqlArr.slice(1).join(';'));
    console.log('multi-222', ret, dalStorage.GetAffectedRows());

    dalStorage.CommitTransaction();
    console.log('dalStorage.CommitTransaction');
  } catch (e) {
    dalStorage.RollBackTransaction();
    console.log('dalStorage.RollBackTransaction');
  }
  */
}

main().catch(err => {
  console.log('main error', err);
});
