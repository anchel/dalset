# dalset for nodejs

## 说明

## 使用

##### 1、微信DB运维平台配置
配置并下发配置文件

##### 2、安装

`tnpm install dalset --save`

##### 3、配置

```javascript
const DALSet = require('dalset').DALSet;
// 或者TS下 import {DALSet} from 'dalset';

const dalset = DALSet.Instance();
dalset.setConfig({
    "serviceName": "mmpaynodeldmmicrosampledao",
    "roleNames": [
        "xnode_testrole_2",
        "xnode_testrole_2_0311"
    ],
    "connTimeout": 2000,
    "removeNodeErrorCount": 1,
    "restoreNodeTimeout": 10000
});
// 配置参数说明：
// serviceName - 当前模块的名称
// roleNames - 角色列表，当前模块用到的角色列表，需要在DB运维平台申请过当前模块对角色的权限
// connTimeout - 连接超时时间，单位是毫秒
// removeNodeErrorCount - 发生多少次错误，就临时剔除节点。如果是2，表示尝试2次连接节点还是失败，就会把节点临时剔除可用列表。
// restoreNodeTimeout - 当一个节点被剔除可用列表后，再次尝试是否可用的间隔时间，单位是毫秒。

try {
    await dalset.initialize(0, new Map());
} catch (e) {
    console.log('dalset.Initialize fail');
}
// 第一个参数是OSSID，第二个参数是idkey的map
// 注意：该接口会抛出错误，需要进行捕获

```

只需在系统启动的时候执行初始化一次即可，组件内部会自动检测DB运维平台下发的配置文件是否有更新，并执行加载。自动更新的检测间隔时间为30秒。

##### 4、接口使用

如果使用过 `mysql`这个库，会很容易上手。`dalset.getDBOperator` 返回的对象，拥有 `mysql.createConnection` 返回的connection对象的大部分接口。

特别提醒：`dalset.getDBOperator` 返回的对象使用完之后，一定要调用 release 接口进行释放

- 普通操作
  ```javascript
  let dalset = DALSet.Instance();
  let dbOper1 = await dalset.getDBOperator({
      roleName: '',
      cmdId: 0,
      setId: 0,
      groupKey: 0,
      databaseKey: 0,
      databaseName: '', // 优先级大于 databaseKey
      tableBaseName: '',
  });
  // roleName，cmdId，setId，groupKey，databaseKey，databaseName，tableBaseName 根据实际情况传入，这些参数和在DB运维平台配置的角色、组、权限等密切相关，请一定正确传入。如果不清楚可咨询数据库运维同事。
  
  try {
    let [rows] = await dbOper1.query('select * from T_tmp limit 10');
    console.log('query rows', rows);

    let [results] = await dbOper1.query("update T_tmp set name = 'bbb' where code = 'aaa' limit 1");
    console.log('update results', results);

    dbOper1.release(); // 一定要记得释放
  } catch (e) {
    dbOper1.release(); // 一定要记得释放
  }
  
  ```
  
  
  
- 事务操作

  ```javascript
  let dalset = DALSet.Instance();
  let dbOper4 = await dalset.getDBOperator({
      roleName: '',
      cmdId: 0,
      setId: 0,
      groupKey: 0,
      databaseKey: 0,
      databaseName: '',
      tableBaseName: '',
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

    dbOper4.release(); // 一定要记得释放
  } catch (e) {
    console.log('transaction catch ', e);
    dbOper4.release(); // 一定要记得释放
  }
  
  ```

- 转义
  ```javascript
  console.log(dbOper.escape('\'a " %'));
  console.log(dbOper.escapeId('\'a " %'));
  ```

##### 5、常见问题

-   `dalset.getDBOperator` 一直pending，检查是不是代码里忘了release，一定要检查代码所有异常都catch住并释放
